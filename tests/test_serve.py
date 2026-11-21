"""Live console bridge (demo): sessions, step streaming, answer key only after the end."""

from __future__ import annotations

import json
import threading
import urllib.error
import urllib.request
from http.server import ThreadingHTTPServer

import pytest
from pathlib import Path

from auditgym.serve import Server, make_handler


@pytest.fixture(scope="module")
def base():
    httpd = ThreadingHTTPServer(("127.0.0.1", 0), make_handler(Server()))
    thread = threading.Thread(target=httpd.serve_forever, daemon=True)
    thread.start()
    yield f"http://127.0.0.1:{httpd.server_address[1]}/api"
    httpd.shutdown()


def call(url, body=None):
    req = urllib.request.Request(url, data=json.dumps(body).encode() if body is not None else None,
                                 headers={"Content-Type": "application/json"}, method="POST" if body is not None else "GET")
    try:
        with urllib.request.urlopen(req, timeout=30) as r:
            return r.status, json.loads(r.read())
    except urllib.error.HTTPError as e:
        return e.code, json.loads(e.read())


def test_manual_session_and_truth_gate(base):
    status, s = call(f"{base}/sessions", {"seed": 1001, "plan": "duplicate_invoice"})
    assert status == 200 and s["observation"]["steps_remaining"] == 100
    sid = s["session"]
    assert call(f"{base}/sessions/{sid}/truth")[0] == 403  # hidden while running
    status, ev = call(f"{base}/sessions/{sid}/step", {"action": {"action": "list_records", "table": "invoices"}})
    assert status == 200 and ev["observation"]["ok"] and ev["observation"]["steps_used"] == 1
    assert "ISS-" not in json.dumps(ev)
    eid = s["info"]["episode_id"]
    status, ev = call(f"{base}/sessions/{sid}/step", {"action": {"action": "submit", "findings": {"episode_id": eid, "findings": []}}})
    assert ev["terminated"]
    status, truth = call(f"{base}/sessions/{sid}/truth")
    assert status == 200 and [i["type"] for i in truth["issues"]] == ["duplicate_invoice"]


def test_stream_emits_one_event_per_step(base):
    _, s = call(f"{base}/sessions", {"seed": 1002, "plan": "clean"})
    events = []
    with urllib.request.urlopen(f"{base}/sessions/{s['session']}/run?policy=explorer&delay_ms=0", timeout=60) as r:
        for raw in r:
            line = raw.decode().strip()
            if line.startswith("event:"):
                events.append({"event": line.split(":", 1)[1].strip()})
            elif line.startswith("data:"):
                events[-1]["data"] = json.loads(line[5:])
    steps = [e["data"] for e in events if e["event"] == "step"]
    assert events[-1]["event"] == "end"
    assert [e["observation"]["steps_used"] for e in steps] == list(range(1, len(steps) + 1))
    assert steps[-1]["terminated"] and steps[-1]["action"]["action"] == "submit"


def test_bad_requests(base):
    assert call(f"{base}/sessions", {"seed": "x"})[0] == 400
    assert call(f"{base}/sessions", {"seed": 1, "plan": "nope"})[0] == 400
    assert call(f"{base}/sessions/nope/step", {"action": {}})[0] == 404
    _, s = call(f"{base}/sessions", {"seed": 3})
    assert call(f"{base}/sessions/{s['session']}/run?policy=nope")[0] == 400


def test_static_site_and_limits(tmp_path):
    from auditgym import serve as srv

    (tmp_path / "static").mkdir()
    (tmp_path / "index.html").write_text("<h1>landing</h1>")
    (tmp_path / "console.html").write_text("<div id=root></div>")
    (tmp_path / "static" / "app.js").write_text("console.log(1)")
    (tmp_path.parent / "secret.txt").write_text("nope")
    server = srv.Server(static_dir=tmp_path)
    httpd = ThreadingHTTPServer(("127.0.0.1", 0), make_handler(server))
    threading.Thread(target=httpd.serve_forever, daemon=True).start()
    root = f"http://127.0.0.1:{httpd.server_address[1]}"

    def get(path):
        try:
            with urllib.request.urlopen(root + path, timeout=10) as r:
                return r.status, r.read().decode(), r.headers.get("Content-Type")
        except urllib.error.HTTPError as e:
            return e.code, "", None

    assert get("/")[1] == "<h1>landing</h1>"
    assert get("/console/episodes/duplicate")[1] == "<div id=root></div>"
    status, body, ctype = get("/static/app.js")
    assert status == 200 and "javascript" in ctype
    assert get("/../secret.txt")[0] == 404 and get("/%2e%2e/secret.txt")[0] == 404
    assert get("/api/health")[0] == 200

    # rate limit on new episodes per client
    for _ in range(srv.CREATE_PER_MINUTE):
        assert call(f"{root}/api/sessions", {"seed": 5, "plan": "clean"})[0] == 200
    assert call(f"{root}/api/sessions", {"seed": 5, "plan": "clean"})[0] == 429
    # sessions are capped and their folders are deleted
    assert len(server.sessions) <= srv.MAX_SESSIONS
    dirs = [s.workdir for s in server.sessions.values()]
    for sid, session in list(server.sessions.items()):
        session.touched = 0
    server.sweep()
    assert not server.sessions and not any(Path(d).exists() for d in dirs)
    httpd.shutdown()
