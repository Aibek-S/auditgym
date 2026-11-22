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
import mimetypes
import os
import secrets
import shutil
import tempfile
from pathlib import Path
import threading
import time
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer
from urllib.parse import parse_qs, urlparse

from auditgym.env import AuditEnv
from auditgym.episode import load_private
from auditgym.generate import load_config

MAX_SESSIONS = 24          # small server (xboing, 3 GB RAM): oldest sessions are evicted
SESSION_TTL_S = 30 * 60    # idle sessions and their episode folders are removed
MAX_STREAMS = 4            # concurrent agent streams
CREATE_PER_MINUTE = 20     # new episodes per client address per minute
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
        self.workdir = tempfile.mkdtemp(prefix="auditgym-session-")
        self.env = AuditEnv(config=load_config(**overrides), scorer=scorer, workdir=self.workdir)
        self.seed, self.plan = seed, plan
        self.first = self.env.reset(seed=seed)
        self.last = self.first[0]
        self.lock = threading.Lock()
        self.created = self.touched = time.time()

    def close(self) -> None:
        self.env.close()
        shutil.rmtree(self.workdir, ignore_errors=True)

    @property
    def done(self) -> bool:
        return self.env._done


class Server:
    def __init__(self, static_dir: str | Path | None = None):
        self.sessions: dict[str, Session] = {}
        self.lock = threading.Lock()
        self.static_dir = Path(static_dir).resolve() if static_dir else None
        self.streams = threading.BoundedSemaphore(MAX_STREAMS)
        self.rate: dict[str, list[float]] = {}

    def allow_create(self, client: str) -> bool:
        now = time.time()
        with self.lock:
            hits = [t for t in self.rate.get(client, []) if now - t < 60]
            if len(hits) >= CREATE_PER_MINUTE:
                self.rate[client] = hits
                return False
            hits.append(now)
            self.rate[client] = hits
            if len(self.rate) > 5000:
                self.rate = {k: v for k, v in self.rate.items() if v and now - v[-1] < 60}
            return True

    def sweep(self) -> None:
        now = time.time()
        with self.lock:
            stale = [k for k, v in self.sessions.items() if now - v.touched > SESSION_TTL_S]
            dropped = [self.sessions.pop(k) for k in stale]
        for session in dropped:
            session.close()

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
        self.sweep()
        evicted = None
        with self.lock:
            if len(self.sessions) >= MAX_SESSIONS:
                oldest = min(self.sessions, key=lambda k: self.sessions[k].touched)
                evicted = self.sessions.pop(oldest)
            self.sessions[sid] = session
        if evicted:
            evicted.close()
        obs, info = session.first
        return {"session": sid, "seed": seed, "plan": plan, "observation": obs, "info": info}

    def get(self, sid: str) -> Session:
        session = self.sessions.get(sid)
        if session is None:
            raise KeyError("unknown or expired session")
        session.touched = time.time()
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

        def _client(self) -> str:
            return self.headers.get("CF-Connecting-IP") or self.client_address[0]

        def _static(self) -> bool:
            """Serve the built web console (web/dist) when --static is set. Never serves outside it."""
            if server.static_dir is None:
                return False
            path = urlparse(self.path).path
            root = server.static_dir
            if path == "/" or path == "":
                target = root / "index.html"
            elif path == "/console" or path.startswith("/console/") and "." not in path.rsplit("/", 1)[-1]:
                target = root / "console.html"
            elif path in ("/baselines", "/method"):
                target = root / "console.html"
            else:
                target = (root / path.lstrip("/")).resolve()
                if root not in target.parents or not target.is_file():
                    target = None
            if target is None or not target.is_file():
                self._send(404, {"error": "not found"})
                return True
            data = target.read_bytes()
            ctype = mimetypes.guess_type(target.name)[0] or "application/octet-stream"
            if ctype.startswith("text/") or ctype in ("application/javascript", "application/json", "image/svg+xml"):
                ctype += "; charset=utf-8"
            self.send_response(200)
            self.send_header("Content-Type", ctype)
            self.send_header("Content-Length", str(len(data)))
            cache = "public, max-age=31536000, immutable" if "/static/" in str(target) else "no-cache"
            self.send_header("Cache-Control", cache)
            self.send_header("X-Content-Type-Options", "nosniff")
            self.end_headers()
            self.wfile.write(data)
            return True

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
                if path[:1] != ["api"] and self._static():
                    return None
                return self._send(404, {"error": "not found"})
            except KeyError as exc:
                return self._send(404, {"error": str(exc).strip("'")})
            except PermissionError as exc:
                return self._send(403, {"error": str(exc)})

        def do_POST(self):
            path, _ = self._route()
            try:
                if path == ["api", "sessions"]:
                    if not server.allow_create(self._client()):
                        return self._send(429, {"error": "too many new episodes; wait a minute"})
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
            try:
                delay = min(max(int(query.get("delay_ms", ["300"])[0]), 0), 3000) / 1000
            except ValueError:
                return self._send(400, {"error": "delay_ms must be an integer"})
            if not server.streams.acquire(blocking=False):
                return self._send(429, {"error": "too many agents running; try again shortly"})
            policy = registry[name](session)
            self.send_response(200)
            self.send_header("Content-Type", "text/event-stream")
            self.send_header("Cache-Control", "no-cache, no-transform")
            self.send_header("X-Accel-Buffering", "no")
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
            finally:
                server.streams.release()

    return Handler


def serve(port: int = 8765, host: str = "127.0.0.1", static_dir: str | None = None) -> None:
    server = Server(static_dir)
    httpd = ThreadingHTTPServer((host, port), make_handler(server))
    httpd.daemon_threads = True
    stop = threading.Event()

    def janitor() -> None:
        # Idle sessions expire even when nobody creates a new one (sweep otherwise runs only on create).
        while not stop.wait(60):
            server.sweep()

    threading.Thread(target=janitor, daemon=True, name="auditgym-janitor").start()
    site = f" and the web console from {server.static_dir}" if server.static_dir else ""
    print(f"AuditGym live API on http://{host}:{port}/api{site} (Ctrl+C to stop)", flush=True)
    try:
        httpd.serve_forever()
    except KeyboardInterrupt:
        pass
    finally:
        stop.set()
        for session in list(server.sessions.values()):
            session.close()
