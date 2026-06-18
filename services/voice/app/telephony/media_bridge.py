from __future__ import annotations

import asyncio
import queue
from contextlib import suppress
from typing import Any

import structlog

from app.tiers import resolve_tier

log = structlog.get_logger()


class PjsipPcmWebSocket:
    """Small FastAPI-WebSocket-compatible adapter for in-process PJSIP media.

    Existing LivoCall tiers consume a WebSocket-like object where inbound bytes
    are caller PCM and outbound bytes are bot PCM. PJSIP media callbacks are not
    WebSockets, so this adapter exposes the minimal methods used by the tiers and
    provides thread-safe queues for PJSIP audio ports.
    """

    def __init__(self, *, call_id: str) -> None:
        self.call_id = call_id
        self._inbound: asyncio.Queue[dict[str, Any]] = asyncio.Queue()
        self._outbound: queue.Queue[bytes] = queue.Queue()
        self._closed = False

    async def accept(self) -> None:
        return None

    async def close(self, code: int = 1000) -> None:  # noqa: ARG002
        self._closed = True
        await self._inbound.put({"type": "websocket.disconnect"})

    async def receive(self) -> dict[str, Any]:
        return await self._inbound.get()

    async def send_bytes(self, data: bytes) -> None:
        if data:
            self._outbound.put(bytes(data))

    async def send_text(self, data: str) -> None:  # noqa: ARG002
        return None

    def push_inbound_pcm(self, pcm: bytes) -> None:
        if self._closed or not pcm:
            return
        self._inbound.put_nowait({"type": "websocket.receive", "bytes": bytes(pcm)})

    def pop_outbound_pcm_nowait(self) -> bytes:
        with suppress(queue.Empty):
            return self._outbound.get_nowait()
        return b""


class PjsipAudioPort:
    """PJSUA2 AudioMediaPort bridge to the queue WebSocket adapter."""

    def __init__(self, pj: Any, ws: PjsipPcmWebSocket, *, sample_rate: int = 16000) -> None:
        base = getattr(pj, "AudioMediaPort", object)
        if base is object:
            self._port = None
        else:
            class _Port(base):  # type: ignore[misc, valid-type]
                def onFrameReceived(self, frame: Any) -> None:  # noqa: N802
                    data = _frame_bytes(frame)
                    if data:
                        ws.push_inbound_pcm(data)

                def onFrameRequested(self, frame: Any) -> None:  # noqa: N802
                    data = ws.pop_outbound_pcm_nowait()
                    _set_frame_bytes(frame, data)

            self._port = _Port()
        self.pj = pj
        self.ws = ws
        self.sample_rate = sample_rate

    @property
    def media(self) -> Any | None:
        return self._port

    def create(self) -> Any | None:
        if self._port is None:
            return None
        fmt_cls = getattr(self.pj, "MediaFormatAudio", None)
        fmt = fmt_cls() if fmt_cls is not None else None
        if fmt is not None:
            for attr, value in (
                ("clockRate", self.sample_rate),
                ("channelCount", 1),
                ("bitsPerSample", 16),
                ("frameTimeUsec", 20_000),
            ):
                with suppress(Exception):
                    setattr(fmt, attr, value)
        with suppress(Exception):
            self._port.createPort("livocall-pjsip-media", fmt)
        return self._port


def _frame_bytes(frame: Any) -> bytes:
    data = getattr(frame, "buf", b"")
    if isinstance(data, bytes):
        return data
    if isinstance(data, bytearray):
        return bytes(data)
    with suppress(Exception):
        return bytes(data)
    return b""


def _set_frame_bytes(frame: Any, data: bytes) -> None:
    with suppress(Exception):
        frame.buf = data
    with suppress(Exception):
        frame.size = len(data)


class PjsipMediaBridge:
    """Runs an existing LivoCall tier over an in-process PJSIP media adapter."""

    def __init__(self, pj: Any, *, sample_rate: int = 16000) -> None:
        self.pj = pj
        self.sample_rate = sample_rate
        self.ws: PjsipPcmWebSocket | None = None
        self.audio_port: PjsipAudioPort | None = None
        self.task: asyncio.Task[None] | None = None

    def start(self, call: Any, *, call_id: str, agent_id: str, tier: str) -> None:
        if self.task is not None:
            return
        self.ws = PjsipPcmWebSocket(call_id=call_id)
        self.audio_port = PjsipAudioPort(self.pj, self.ws, sample_rate=self.sample_rate)
        port = self.audio_port.create()
        if port is not None:
            with suppress(Exception):
                call_media = call.getAudioMedia(-1)
                call_media.startTransmit(port)
                port.startTransmit(call_media)
        self.task = asyncio.create_task(self._run_tier(call_id=call_id, agent_id=agent_id, tier=tier))

    async def _run_tier(self, *, call_id: str, agent_id: str, tier: str) -> None:
        if self.ws is None:
            return
        try:
            await resolve_tier(tier).run(
                self.ws,
                call_id=call_id,
                agent_id=agent_id,
                metadata={"source": "pjsip-media"},
            )
        except Exception as exc:  # noqa: BLE001
            log.exception("pjsip.media_bridge_error", call_id=call_id, error=str(exc))

    async def stop(self) -> None:
        if self.ws is not None:
            await self.ws.close()
        if self.task is not None and not self.task.done():
            self.task.cancel()
            with suppress(Exception, asyncio.CancelledError):
                await self.task
