"""FastAPI observability: correlation IDs + optional Sentry + optional OTel.

All tracing integrations are opt-in through environment variables:

- ``SENTRY_DSN`` — initialise sentry-sdk if the package is installed.
- ``OTEL_EXPORTER_OTLP_ENDPOINT`` — bootstrap OpenTelemetry if the
  ``opentelemetry-api`` + ``opentelemetry-sdk`` packages are installed.

Both are soft deps — if the library isn't present we log a warning and
continue. Correlation IDs always work (they're in-process).
"""

from __future__ import annotations

import contextvars
import os
import uuid
from collections.abc import Awaitable, Callable

import structlog
from fastapi import FastAPI, Request, Response

log = structlog.get_logger()

request_id_var: contextvars.ContextVar[str] = contextvars.ContextVar(
    "request_id", default=""
)


def get_request_id() -> str:
    return request_id_var.get("")


def _structlog_correlation_id(_, __, event_dict):  # type: ignore[no-untyped-def]
    if not isinstance(event_dict, dict):
        return event_dict
    rid = request_id_var.get("")
    if rid and "req_id" not in event_dict:
        event_dict["req_id"] = rid
    return event_dict


def install_correlation_processor() -> None:
    """Idempotent — appends a structlog processor so every log line gets req_id."""
    processors = structlog.get_config()["processors"]
    if _structlog_correlation_id in processors:
        return
    structlog.configure(processors=[*processors, _structlog_correlation_id])


def init_sentry() -> None:
    dsn = os.environ.get("SENTRY_DSN", "").strip()
    if not dsn:
        return
    try:
        import sentry_sdk  # type: ignore[import-not-found]
    except ImportError:
        log.warning("observability.sentry_missing", hint="pip install sentry-sdk")
        return
    sentry_sdk.init(
        dsn=dsn,
        traces_sample_rate=float(os.environ.get("SENTRY_TRACES_SAMPLE_RATE", "0.1")),
        environment=os.environ.get("SENTRY_ENVIRONMENT", ""),
        release=os.environ.get("SENTRY_RELEASE", ""),
    )
    log.info("observability.sentry_enabled")


def init_otel(service_name: str = "livocall-engine") -> None:
    endpoint = os.environ.get("OTEL_EXPORTER_OTLP_ENDPOINT", "").strip()
    if not endpoint:
        return
    try:
        from opentelemetry import trace  # type: ignore[import-not-found]
        from opentelemetry.exporter.otlp.proto.http.trace_exporter import (  # type: ignore[import-not-found]
            OTLPSpanExporter,
        )
        from opentelemetry.sdk.resources import Resource  # type: ignore[import-not-found]
        from opentelemetry.sdk.trace import TracerProvider  # type: ignore[import-not-found]
        from opentelemetry.sdk.trace.export import (
            BatchSpanProcessor,  # type: ignore[import-not-found]
        )
    except ImportError:
        log.warning(
            "observability.otel_missing",
            hint=(
                "pip install opentelemetry-api opentelemetry-sdk "
                "opentelemetry-exporter-otlp-proto-http"
            ),
        )
        return
    provider = TracerProvider(
        resource=Resource.create({"service.name": service_name}),
    )
    provider.add_span_processor(BatchSpanProcessor(OTLPSpanExporter(endpoint=endpoint)))
    trace.set_tracer_provider(provider)
    log.info("observability.otel_enabled", endpoint=endpoint)


def install_correlation_middleware(app: FastAPI) -> None:
    @app.middleware("http")
    async def _correlate(
        request: Request, call_next: Callable[[Request], Awaitable[Response]]
    ) -> Response:
        incoming = request.headers.get("x-request-id") or request.headers.get(
            "x-correlation-id"
        )
        rid = incoming if incoming and 8 <= len(incoming) <= 128 else uuid.uuid4().hex
        token = request_id_var.set(rid)
        try:
            response = await call_next(request)
            response.headers["x-request-id"] = rid
            return response
        finally:
            request_id_var.reset(token)
