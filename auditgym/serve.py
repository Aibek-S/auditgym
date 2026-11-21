"""Local HTTP bridge from the web console to the real environment (demo only, stdlib).

    python -m auditgym serve --port 8765

Endpoints (JSON):
    GET  /api/health
    GET  /api/policies
    POST /api/sessions                {seed, plan?, mode?}      -> {session, observation, info}
    POST /api/sessions/<id>/step      {action}                  -> {observation, reward, terminated, truncated, info}
    GET  /api/sessions/<id>/run?policy=explorer&delay_ms=300   -> text/event-stream, one event per step
    GET  /api/sessions/<id>/truth                               -> answer key, ONLY after the episode ended

Isolation: the browser plays the agent's role, so it receives only observations while the episode
runs. The answer key is released after the end, as a post-run review (evaluator side). This server
is not part of the official offline check.
"""

from __future__ import annotations

import json
import secrets
import threading
import time
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer
from urllib.parse import parse_qs, urlparse

from auditgym.env import AuditEnv
from auditgym.episode import load_private
from auditgym.generate import load_config

MAX_SESSIONS = 32
PLANS = {"random": None, "clean": [], "duplicate_invoice": ["duplicate_invoice"],
         "payment_allocation": ["payment_allocation"], "fx_conversion": ["fx_conversion"],
         "period_cutoff": ["period_cutoff"], "I1": ["I1"], "I2": ["I2"]}


def _policies():
    from auditgym import policies

    return policies.registry()


class Session:
    def __init__(self, seed: int, plan: str, mode: str, scorer):
        overrides = {"env": {"mode": mode}}
        if PLANS[plan] is not None:
            overrides["errors"] = {"plan": PLANS[plan]}
        self.env = AuditEnv(config=load_config(**overrides), scorer=scorer)
        self.seed, self.plan = seed, plan
        self.first = self.env.reset(seed=seed)
        self.last = self.first[0]
        self.lock = threading.Lock()
        self.created = time.time()

    @property
    def done(self) -> bool:
        return self.env._done


class Server:
    def __init__(self):
        self.sessions: dict[str, Session] = {}
        self.lock = threading.Lock()

    def scorer(self):
        try:
            from auditgym.matcher import score_episode
        except ImportError:
            return None
        return score_episode

    def create(self, body: dict) -> dict:
        seed = body.get("seed")
        plan = body.get("plan", "random")
        mode = body.get("mode", "open")
        if type(seed) is not int or not 0 <= seed < 10**9 or plan not in PLANS or mode not in ("open", "closed"):
            raise ValueError("seed must be an integer 0..1e9, plan one of " + ", ".join(PLANS) + ", mode open|closed")
        session = Session(seed, plan, mode, self.scorer())
        sid = secrets.token_hex(8)
        with self.lock:
            if len(self.sessions) >= MAX_SESSIONS:
                oldest = min(self.sessions, key=lambda k: self.sessions[k].created)
                del self.sessions[oldest]
            self.sessions[sid] = session
        obs, info = session.first
        return {"session": sid, "seed": seed, "plan": plan, "observation": obs, "info": info}

    def get(self, sid: str) -> Session:
        session = self.sessions.get(sid)
        if session is None:
            raise KeyError("unknown session")
        return session

    @staticmethod
    def step(session: Session, action) -> dict:
        with session.lock:
            obs, reward, terminated, truncated, info = session.env.step(action)
            session.last = obs
        return {"action": action, "observation": obs, "reward": reward, "terminated": terminated,
                "truncated": truncated, "info": info}

    @staticmethod
    def truth(session: Session) -> dict:
        if not session.done:
            raise PermissionError("the answer key is available only after the episode ends")
        private = load_private(session.env.episode_dir)
        log = session.env.evaluator_log[-1] if session.env.evaluator_log else None
        return {"issues": private["truth"]["issues"], "evaluation": log}


def make_handler(server: Server):
    class Handler(BaseHTTPRequestHandler):
        protocol_version = "HTTP/1.1"

        def log_message(self, *args):  # quiet
            pass

        def _send(self, status: int, payload) -> None:
            body = json.dumps(payload, ensure_ascii=False).encode()
            self.send_response(status)
            self.send_header("Content-Type", "application/json; charset=utf-8")
            self.send_header("Content-Length", str(len(body)))
            self.send_header("Access-Control-Allow-Origin", "*")
            self.end_headers()
            self.wfile.write(body)

        def do_OPTIONS(self):
            self.send_response(204)
            self.send_header("Access-Control-Allow-Origin", "*")
            self.send_header("Access-Control-Allow-Methods", "GET, POST, OPTIONS")
            self.send_header("Access-Control-Allow-Headers", "Content-Type")
            self.send_header("Content-Length", "0")
            self.end_headers()

        def _body(self) -> dict:
            length = min(int(self.headers.get("Content-Length") or 0), 200_000)
            data = json.loads(self.rfile.read(length) or b"{}")
            if not isinstance(data, dict):
                raise ValueError("body must be a JSON object")
            return data

        def _route(self):
            parts = urlparse(self.path)
            return [p for p in parts.path.split("/") if p], parse_qs(parts.query)

        def do_GET(self):
            path, query = self._route()
            try:
                if path == ["api", "health"]:
                    return self._send(200, {"ok": True, "scored": server.scorer() is not None})
                if path == ["api", "policies"]:
                    return self._send(200, {"policies": sorted(_policies()), "plans": list(PLANS)})
                if len(path) == 4 and path[:2] == ["api", "sessions"] and path[3] == "truth":
                    return self._send(200, server.truth(server.get(path[2])))
                if len(path) == 4 and path[:2] == ["api", "sessions"] and path[3] == "run":
                    return self._stream(server.get(path[2]), query)
                return self._send(404, {"error": "not found"})
            except KeyError as exc:
                return self._send(404, {"error": str(exc).strip("'")})
            except PermissionError as exc:
                return self._send(403, {"error": str(exc)})

        def do_POST(self):
            path, _ = self._route()
            try:
                if path == ["api", "sessions"]:
                    return self._send(200, server.create(self._body()))
                if len(path) == 4 and path[:2] == ["api", "sessions"] and path[3] == "step":
                    body = self._body()
                    return self._send(200, server.step(server.get(path[2]), body.get("action")))
                return self._send(404, {"error": "not found"})
            except KeyError as exc:
                return self._send(404, {"error": str(exc).strip("'")})
            except (ValueError, json.JSONDecodeError) as exc:
                return self._send(400, {"error": str(exc)})

        def _stream(self, session: Session, query):
            name = query.get("policy", ["explorer"])[0]
            registry = _policies()
            if name not in registry:
                return self._send(400, {"error": "unknown policy"})
            delay = min(max(int(query.get("delay_ms", ["300"])[0]), 0), 3000) / 1000
            policy = registry[name](session)
            self.send_response(200)
            self.send_header("Content-Type", "text/event-stream")
            self.send_header("Cache-Control", "no-cache")
            self.send_header("Access-Control-Allow-Origin", "*")
            self.send_header("Connection", "close")
            self.end_headers()
            self.close_connection = True
            try:
                obs = session.last
                while not session.done:
                    action = policy.act(obs)
                    event = server.step(session, action)
                    obs = event["observation"]
                    self.wfile.write(f"event: step\ndata: {json.dumps(event, ensure_ascii=False)}\n\n".encode())
                    self.wfile.flush()
                    if not session.done:
                        time.sleep(delay)
                self.wfile.write(b"event: end\ndata: {}\n\n")
                self.wfile.flush()
            except (BrokenPipeError, ConnectionResetError):
                pass

    return Handler


def serve(port: int = 8765, host: str = "127.0.0.1") -> None:
    httpd = ThreadingHTTPServer((host, port), make_handler(Server()))
    print(f"AuditGym live API on http://{host}:{port}/api (Ctrl+C to stop)")
    try:
        httpd.serve_forever()
    except KeyboardInterrupt:
        pass
