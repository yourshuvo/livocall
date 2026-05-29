#!/usr/bin/env python3
from __future__ import annotations

import json
import os
import subprocess
import threading
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer


HOST = os.environ.get("FREESWITCH_SYNC_HOST", "0.0.0.0")
PORT = int(os.environ.get("FREESWITCH_SYNC_PORT", "8789"))
TOKEN = os.environ.get("FREESWITCH_SYNC_WEBHOOK_TOKEN", "")
SYNC_SCRIPT = os.environ.get(
    "FREESWITCH_SYNC_SCRIPT", "/opt/livocall/sync-freeswitch-gateways.sh"
)
ENV_FILE = os.environ.get("ENV_FILE", "/root/livocall.env")

lock = threading.Lock()


class Handler(BaseHTTPRequestHandler):
    server_version = "livocall-fs-sync/0.1"

    def _json(self, status: int, payload: dict[str, object]) -> None:
        data = json.dumps(payload).encode("utf-8")
        self.send_response(status)
        self.send_header("content-type", "application/json")
        self.send_header("content-length", str(len(data)))
        self.end_headers()
        self.wfile.write(data)

    def do_GET(self) -> None:  # noqa: N802
        if self.path == "/health":
            self._json(200, {"ok": True})
            return
        self._json(404, {"ok": False, "error": "not_found"})

    def do_POST(self) -> None:  # noqa: N802
        if self.path != "/sync":
            self._json(404, {"ok": False, "error": "not_found"})
            return
        if not TOKEN:
            self._json(500, {"ok": False, "error": "token_not_configured"})
            return
        auth = self.headers.get("authorization", "")
        if auth != f"Bearer {TOKEN}":
            self._json(401, {"ok": False, "error": "unauthorized"})
            return
        if not lock.acquire(blocking=False):
            self._json(202, {"ok": True, "status": "already_running"})
            return
        try:
            env = os.environ.copy()
            env["ENV_FILE"] = ENV_FILE
            result = subprocess.run(
                [SYNC_SCRIPT],
                check=False,
                env=env,
                capture_output=True,
                text=True,
                timeout=60,
            )
            if result.returncode != 0:
                self._json(
                    500,
                    {
                        "ok": False,
                        "status": "sync_failed",
                        "stdout": result.stdout[-2000:],
                        "stderr": result.stderr[-2000:],
                    },
                )
                return
            self._json(200, {"ok": True, "status": "synced"})
        except subprocess.TimeoutExpired:
            self._json(504, {"ok": False, "status": "sync_timeout"})
        finally:
            lock.release()


def main() -> int:
    server = ThreadingHTTPServer((HOST, PORT), Handler)
    print(f"listening on {HOST}:{PORT}")
    server.serve_forever()
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
