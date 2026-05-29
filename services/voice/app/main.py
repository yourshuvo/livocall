from __future__ import annotations

from contextlib import asynccontextmanager
from typing import Any

import structlog
from fastapi import Depends, FastAPI, HTTPException, WebSocket, WebSocketDisconnect, status
from pydantic import BaseModel, Field

from app import event_bridge, originator
from app.latency import LatencyTrace
from app.observability import (
    init_otel,
    init_sentry,
    install_correlation_middleware,
    install_correlation_processor,
)
from app.security import require_voice_token
from app.settings import settings
from app.tiers import resolve_tier
from app.web_client import aclose as aclose_web_client
from app.workers.campaign_dialer import get_dialer
from app.workers.kb_ingestion import get_ingestor
from app.workers.webhook_scheduler import get_scheduler
from app.ws_auth import verify as ws_verify

log = structlog.get_logger()


@asynccontextmanager
async def lifespan(app: FastAPI):  # noqa: ARG001
    # In fake-driver / dev mode we skip the ESL event consumer because there
    # is no FreeSWITCH listening — the consumer would just spin in a reconnect
    # loop. Real deployments either set FS_HOST or leave the default and have
    # FreeSWITCH on localhost.
    consumer = None
    if not settings.voice_fake_driver:
        consumer = event_bridge.get_consumer()
        consumer.start()
        log.info("startup", esl_host=settings.fs_host, esl_port=settings.fs_esl_port)
    else:
        log.info("startup", mode="fake_driver")

    dialer = None
    if settings.enable_campaign_dialer:
        dialer = get_dialer()
        dialer.start()
    ingestor = None
    if settings.enable_kb_ingestor:
        ingestor = get_ingestor()
        ingestor.start()
    scheduler = None
    if settings.enable_webhook_scheduler:
        scheduler = get_scheduler()
        scheduler.start()

    try:
        yield
    finally:
        if scheduler is not None:
            await scheduler.stop()
        if dialer is not None:
            await dialer.stop()
        if ingestor is not None:
            await ingestor.stop()
        if consumer is not None:
            await consumer.stop()
        await aclose_web_client()


install_correlation_processor()
init_sentry()
init_otel()

app = FastAPI(title="livocall engine", version="0.2.0", lifespan=lifespan)
install_correlation_middleware(app)


@app.get("/health")
async def health() -> dict[str, object]:
    return {
        "ok": True,
        "service": "livocall-engine",
        "version": "0.2.0",
        "fs_host": settings.fs_host,
        "fs_esl_port": settings.fs_esl_port,
        "fake_driver": settings.voice_fake_driver,
        "web_base_url": settings.web_base_url,
        "gemini_live_model": settings.gemini_live_model,
        "grok_voice_model": settings.grok_voice_model,
        "grok_voice_language": settings.grok_voice_language,
        "grok_voice_audio_format": settings.grok_voice_audio_format,
        "grok_voice_audio_rate": settings.grok_voice_audio_rate,
        "gemini_preconnect_enabled": settings.gemini_preconnect_enabled,
        "low_latency_pcmu_bridge_enabled": settings.low_latency_pcmu_bridge_enabled,
        "low_latency_pcmu_bridge_strict": settings.low_latency_pcmu_bridge_strict,
        "fs_preferred_codec": settings.fs_preferred_codec,
        "fs_codec_ms": settings.fs_codec_ms,
        "audio_fork_buffer_ms": settings.audio_fork_buffer_ms,
        "audio_fork_jitter_buffer_ms": settings.audio_fork_jitter_buffer_ms,
    }


class OriginateRequest(BaseModel):
    agent_id: str
    to_e164: str = Field(pattern=r"^\+\d{8,15}$")
    from_e164: str | None = Field(default=None, pattern=r"^\+\d{8,15}$")
    tier: str  # 'gemini_live' | 'grok_voice' | 'pipeline' | 'dtmf'
    metadata: dict[str, str] = Field(default_factory=dict)
    tools: list[dict[str, Any]] = Field(default_factory=list)


class TransferRequest(BaseModel):
    target: str = Field(min_length=1)


class ControlRequest(BaseModel):
    action: str = Field(pattern=r"^(listen|barge)$")
    supervisor_id: str = Field(min_length=1)
    target_e164: str = Field(pattern=r"^\+\d{8,15}$")


class IvrActionRequest(BaseModel):
    action: str = Field(min_length=1, max_length=240)


class InboundRouteRequest(BaseModel):
    destination_number: str = Field(min_length=6)
    caller_number: str = Field(default="", max_length=32)
    fs_uuid: str = Field(min_length=8)


@app.post("/calls/originate", dependencies=[Depends(require_voice_token)])
async def originate(req: OriginateRequest) -> dict[str, Any]:
    log.info("originate.requested", **req.model_dump())
    try:
        result = await originator.originate_call(
            agent_id=req.agent_id,
            to_e164=req.to_e164,
            tier=req.tier,
            from_e164=req.from_e164,
            metadata=req.metadata,
            tools=req.tools,
        )
        return result
    except ValueError as exc:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail=str(exc)) from exc
    except Exception as exc:  # noqa: BLE001
        log.exception("originate.error")
        raise HTTPException(
            status_code=status.HTTP_502_BAD_GATEWAY, detail=str(exc)
        ) from exc


@app.post("/calls/{call_id}/hangup", dependencies=[Depends(require_voice_token)])
async def hangup(call_id: str) -> dict[str, bool]:
    try:
        ok = await originator.hangup_call(call_id)
    except Exception as exc:  # noqa: BLE001
        log.exception("hangup.error")
        raise HTTPException(
            status_code=status.HTTP_502_BAD_GATEWAY, detail=str(exc)
        ) from exc
    return {"ok": ok}


@app.post("/calls/{call_id}/transfer", dependencies=[Depends(require_voice_token)])
async def transfer(call_id: str, req: TransferRequest) -> dict[str, bool]:
    try:
        ok = await originator.transfer_call(call_id, req.target)
    except Exception as exc:  # noqa: BLE001
        log.exception("transfer.error")
        raise HTTPException(
            status_code=status.HTTP_502_BAD_GATEWAY, detail=str(exc)
        ) from exc
    return {"ok": ok}


@app.post("/calls/{call_id}/control", dependencies=[Depends(require_voice_token)])
async def control(call_id: str, req: ControlRequest) -> dict[str, Any]:
    try:
        return await originator.control_call(
            call_id,
            action=req.action,
            supervisor_id=req.supervisor_id,
            target_e164=req.target_e164,
        )
    except ValueError as exc:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail=str(exc)) from exc
    except Exception as exc:  # noqa: BLE001
        log.exception("control.error", call_id=call_id, action=req.action)
        raise HTTPException(
            status_code=status.HTTP_502_BAD_GATEWAY, detail=str(exc)
        ) from exc


@app.post("/calls/{call_id}/ivr-action", dependencies=[Depends(require_voice_token)])
async def ivr_action(call_id: str, req: IvrActionRequest) -> dict[str, bool]:
    try:
        ok = await originator.execute_ivr_action(call_id, req.action)
    except Exception as exc:  # noqa: BLE001
        log.exception("ivr_action.error")
        raise HTTPException(
            status_code=status.HTTP_502_BAD_GATEWAY, detail=str(exc)
        ) from exc
    return {"ok": ok}


@app.post("/calls/inbound-route", dependencies=[Depends(require_voice_token)])
async def inbound_route(req: InboundRouteRequest) -> dict[str, Any]:
    try:
        return await originator.create_inbound_call(
            did_e164=_normalize_e164(req.destination_number),
            caller_e164=_normalize_e164(req.caller_number) if req.caller_number else "",
            fs_uuid=req.fs_uuid,
            metadata={"source": "inbound-did"},
        )
    except Exception as exc:  # noqa: BLE001
        log.warning("inbound_route.error", error=str(exc), did=req.destination_number)
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail=str(exc)) from exc


def _normalize_e164(value: str) -> str:
    raw = "".join(ch for ch in value.strip() if ch.isdigit() or ch == "+")
    if raw.startswith("+"):
        return raw
    if raw.startswith("00"):
        return f"+{raw[2:]}"
    return f"+{raw}"


@app.websocket("/ws/audio")
async def ws_audio(ws: WebSocket) -> None:
    """
    mod_audio_fork connects here with raw L16/16k frames in both directions.
    Query params:
      - call_id: FreeSWITCH UUID
      - agent_id: Mongo ObjectId
      - tier:    'gemini_live' | 'grok_voice' | 'pipeline' | 'dtmf'
    """
    qp = ws.query_params
    call_id = qp.get("call_id", "")
    agent_id = qp.get("agent_id", "")
    tier_name = qp.get("tier", "pipeline")
    prompt = qp.get("prompt", "")
    auth = qp.get("auth", "")

    if not ws_verify(call_id, auth or None):
        log.warning("ws.auth_failed", call_id=call_id)
        await ws.close(code=1008)
        return

    await ws.accept()
    trace = LatencyTrace(call_id)
    trace.mark("audio_fork_connected")
    # Metadata flattened as repeated query params: ?meta=k:v&meta=k2:v2
    metadata: dict[str, str] = {}
    for kv in qp.getlist("meta") if hasattr(qp, "getlist") else []:
        if ":" in kv:
            k, v = kv.split(":", 1)
            metadata[k] = v

    log.info("ws.connected", call_id=call_id, agent_id=agent_id, tier=tier_name)
    try:
        tier = resolve_tier(tier_name)
        await tier.run(
            ws,
            call_id=call_id,
            agent_id=agent_id,
            prompt=prompt,
            metadata={**metadata, "_audio_fork_connected_ms": str(trace.marks["audio_fork_connected"])},
        )
    except WebSocketDisconnect:
        log.info("ws.disconnected", call_id=call_id)
    except Exception as exc:  # noqa: BLE001
        log.error("ws.error", error=str(exc), call_id=call_id)
        await ws.close(code=1011)


@app.websocket("/ws/audio-pcmu")
async def ws_audio_pcmu(ws: WebSocket) -> None:
    qp = ws.query_params
    call_id = qp.get("call_id", "")
    agent_id = qp.get("agent_id", "")
    tier_name = qp.get("tier", "gemini_live")
    prompt = qp.get("prompt", "")
    auth = qp.get("auth", "")

    if not ws_verify(call_id, auth or None):
        log.warning("ws_pcmu.auth_failed", call_id=call_id)
        await ws.close(code=1008)
        return

    await ws.accept()
    trace = LatencyTrace(call_id)
    trace.mark("pcmu_bridge_connected")
    metadata: dict[str, str] = {}
    for kv in qp.getlist("meta") if hasattr(qp, "getlist") else []:
        if ":" in kv:
            k, v = kv.split(":", 1)
            metadata[k] = v

    log.info("ws_pcmu.connected", call_id=call_id, agent_id=agent_id, tier=tier_name)
    try:
        if tier_name == "grok_voice":
            from app.tiers.grok_voice import GrokVoiceTier

            runner = GrokVoiceTier()
        else:
            from app.gemini_pcm_bridge import GeminiPcmBridge

            runner = GeminiPcmBridge.for_phone_call()
        await runner.run(
            ws,
            call_id=call_id,
            agent_id=agent_id,
            prompt=prompt,
            metadata={**metadata, "_pcmu_bridge_connected_ms": str(trace.marks["pcmu_bridge_connected"])},
        )
    except WebSocketDisconnect:
        log.info("ws_pcmu.disconnected", call_id=call_id)
    except Exception as exc:  # noqa: BLE001
        log.error("ws_pcmu.error", error=str(exc), call_id=call_id)
        await ws.close(code=1011)
