"""Correlation-id middleware + request-id propagation."""

from __future__ import annotations

from fastapi.testclient import TestClient

from app.main import app


def test_request_id_echoed_when_absent() -> None:
    with TestClient(app) as c:
        r = c.get("/health")
        assert r.status_code == 200
        assert "x-request-id" in {k.lower() for k in r.headers}
        # Generated one is at least 8 chars (uuid4().hex is 32)
        rid = r.headers["x-request-id"]
        assert 8 <= len(rid) <= 128


def test_request_id_propagated_from_client() -> None:
    provided = "my-trace-abcdef12"
    with TestClient(app) as c:
        r = c.get("/health", headers={"x-request-id": provided})
        assert r.headers["x-request-id"] == provided
