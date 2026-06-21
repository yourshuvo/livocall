from __future__ import annotations

from contextlib import asynccontextmanager
from typing import Any
from urllib.parse import urlsplit

import structlog
from fastapi import (
    BackgroundTasks,
    Depends,
    FastAPI,
    HTTPException,
    Request,
    WebSocket,
    WebSocketDisconnect,
    status,
)
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel, Field, field_validator

from app import originator, telephony
from app.browser_webrtc import (
    aclose as aclose_browser_webrtc,
)
from app.browser_webrtc import (
    handle_ice_candidate as handle_browser_ice_candidate,
)
from app.browser_webrtc import (
    handle_offer as handle_browser_webrtc_offer,
)
from app.browser_webrtc import (
    prewarm as prewarm_browser_webrtc,
)
from app.browser_webrtc import (
    public_ice_servers,
)
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
    # In fake-driver / dev mode we skip the SIP edge entirely. Real deployments
    # use the embedded PJSIP edge for both signaling and media.
    edge = None
    if settings.voice_fake_driver:
        log.info("startup", mode="fake_driver")
    else:
        edge = telephony.get_edge()
        await edge.start()
        log.info("startup", telephony_edge=settings.telephony_edge)

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
        if edge is not None:
            await edge.stop()
        await aclose_browser_webrtc()
        await aclose_web_client()


install_correlation_processor()
init_sentry()
init_otel()


def _origin_from_url(value: str) -> str:
    try:
        parsed = urlsplit(value)
    except ValueError:
        return ""
    if not parsed.scheme or not parsed.hostname:
        return ""
    port = f":{parsed.port}" if parsed.port else ""
    return f"{parsed.scheme}://{parsed.hostname}{port}"


def _cors_origins() -> list[str]:
    origins = {
        _origin_from_url(settings.web_base_url),
        "http://localhost:3000",
        "http://127.0.0.1:3000",
    }
    return sorted(origin for origin in origins if origin)


app = FastAPI(title="livocall engine", version="0.2.0", lifespan=lifespan)
app.add_middleware(
    CORSMiddleware,
    allow_origins=_cors_origins(),
    allow_credentials=False,
    allow_methods=["GET", "POST", "PATCH", "OPTIONS"],
    allow_headers=["*"],
    max_age=600,
)
install_correlation_middleware(app)


@app.get("/health")
async def health() -> dict[str, object]:
    return {
        "ok": True,
        "service": "livocall-engine",
        "version": "0.2.0",
        "telephony_edge": settings.telephony_edge,
        "pjsip_sip_server": settings.pjsip_sip_server,
        "pjsip_sip_port": settings.pjsip_sip_port,
        "pjsip_local_sip_port": settings.pjsip_local_sip_port,
        "pjsip_default_account_slug": settings.pjsip_default_account_slug,
        "pjsip_load_accounts_from_db": settings.pjsip_load_accounts_from_db,
        "pjsip_rtp_port_start": settings.pjsip_rtp_port_start,
        "pjsip_rtp_port_range": settings.pjsip_rtp_port_range,
        "pjsip_codecs": settings.pjsip_codecs,
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
        "pjsip_frame_ms": settings.pjsip_frame_ms,
        "browser_webrtc_enabled": settings.browser_webrtc_enabled,
    }


@app.post("/pjsip/reload", dependencies=[Depends(require_voice_token)])
async def pjsip_reload() -> dict[str, Any]:
    edge = telephony.get_edge()
    reload_accounts = getattr(edge, "reload_accounts", None)
    if not callable(reload_accounts):
        return {"ok": False, "edge": getattr(edge, "name", "unknown"), "reason": "unsupported"}
    result = await reload_accounts(ignore_errors=False)
    return dict(result)


@app.get("/webrtc/browser-config")
async def browser_webrtc_config() -> dict[str, object]:
    return {
        "enabled": settings.browser_webrtc_enabled,
        "iceServers": public_ice_servers(),
    }


@app.post("/webrtc/browser-prewarm")
async def browser_webrtc_prewarm() -> dict[str, object]:
    return prewarm_browser_webrtc()


@app.post("/webrtc/browser-offer")
async def browser_webrtc_offer(request: Request, background_tasks: BackgroundTasks) -> Any:
    return await handle_browser_webrtc_offer(request, background_tasks)


@app.patch("/webrtc/browser-offer")
async def browser_webrtc_ice_candidate(request: Request) -> dict[str, str]:
    return await handle_browser_ice_candidate(request)


class OriginateRequest(BaseModel):
    agent_id: str
    to_e164: str = Field(pattern=r"^\+\d{8,15}$")
    from_e164: str | None = Field(default=None, pattern=r"^\+\d{8,15}$")
    tier: str  # 'gemini_live' | 'grok_voice' | 'pipeline' | 'dtmf'
    metadata: dict[str, str] = Field(default_factory=dict)
    tools: list[dict[str, Any]] = Field(default_factory=list)

    @field_validator("to_e164", "from_e164", mode="before")
    @classmethod
    def _normalize_bd_phone_numbers(cls, value: Any) -> Any:
        if value is None:
            return None
        if isinstance(value, str):
            return _normalize_e164(value)
        return value


class TransferRequest(BaseModel):
    target: str = Field(min_length=1)


class ControlRequest(BaseModel):
    action: str = Field(pattern=r"^(listen|barge)$")
    supervisor_id: str = Field(min_length=1)
    target_e164: str = Field(pattern=r"^\+\d{8,15}$")


class IvrActionRequest(BaseModel):
    action: str = Field(min_length=1, max_length=240)


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
        raise HTTPException(status_code=status.HTTP_502_BAD_GATEWAY, detail=str(exc)) from exc


@app.post("/calls/{call_id}/hangup", dependencies=[Depends(require_voice_token)])
async def hangup(call_id: str) -> dict[str, bool]:
    try:
        ok = await originator.hangup_call(call_id)
    except Exception as exc:  # noqa: BLE001
        log.exception("hangup.error")
        raise HTTPException(status_code=status.HTTP_502_BAD_GATEWAY, detail=str(exc)) from exc
    return {"ok": ok}


@app.post("/calls/{call_id}/transfer", dependencies=[Depends(require_voice_token)])
async def transfer(call_id: str, req: TransferRequest) -> dict[str, bool]:
    try:
        ok = await originator.transfer_call(call_id, req.target)
    except Exception as exc:  # noqa: BLE001
        log.exception("transfer.error")
        raise HTTPException(status_code=status.HTTP_502_BAD_GATEWAY, detail=str(exc)) from exc
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
        raise HTTPException(status_code=status.HTTP_502_BAD_GATEWAY, detail=str(exc)) from exc


@app.post("/calls/{call_id}/ivr-action", dependencies=[Depends(require_voice_token)])
async def ivr_action(call_id: str, req: IvrActionRequest) -> dict[str, bool]:
    try:
        ok = await originator.execute_ivr_action(call_id, req.action)
    except Exception as exc:  # noqa: BLE001
        log.exception("ivr_action.error")
        raise HTTPException(status_code=status.HTTP_502_BAD_GATEWAY, detail=str(exc)) from exc
    return {"ok": ok}


def _normalize_e164(value: str) -> str:
    raw = "".join(ch for ch in value.strip() if ch.isdigit() or ch == "+")
    if not raw:
        return ""
    digits = "".join(ch for ch in raw if ch.isdigit())
    if raw.startswith("+"):
        if digits.startswith("880"):
            return f"+{digits}"
        if digits.startswith("0"):
            return f"+880{digits[1:]}"
        return f"+{digits}"
    if digits.startswith("00880"):
        return f"+{digits[2:]}"
    if digits.startswith("00"):
        return f"+{digits[2:]}"
    if digits.startswith("880"):
        return f"+{digits}"
    if digits.startswith("0"):
        return f"+880{digits[1:]}"
    # BD SIP providers can present destination/caller IDs without either the
    # country code or national trunk prefix, e.g. 9639148184 for 09639148184.
    if len(digits) == 10 and digits[0] in {"1", "9"}:
        return f"+880{digits}"
    return f"+{digits}"


@app.websocket("/ws/audio")
async def ws_audio(ws: WebSocket) -> None:
    """
    Direct media adapters connect here with raw L16/16k frames in both directions.
    Query params:
      - call_id: call document id or edge call id
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
    trace.mark("media_bridge_connected")
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
            metadata={
                **metadata,
                "_media_bridge_connected_ms": str(trace.marks["media_bridge_connected"]),
            },
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
            metadata={
                **metadata,
                "_pcmu_bridge_connected_ms": str(trace.marks["pcmu_bridge_connected"]),
            },
        )
    except WebSocketDisconnect:
        log.info("ws_pcmu.disconnected", call_id=call_id)
    except Exception as exc:  # noqa: BLE001
        log.error("ws_pcmu.error", error=str(exc), call_id=call_id)
        await ws.close(code=1011)
