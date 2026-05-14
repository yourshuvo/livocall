"""Async ESL client.

Two complementary capabilities:

* :class:`EslClient` is an inbound (outbound-from-FreeSWITCH? confusingly named)
  control connection. We open one to FreeSWITCH on port 8021, authenticate, and
  then issue ``bgapi`` commands (originate, uuid_kill, uuid_transfer) and parse
  the JSON-ish response blocks. The same client is also used to subscribe to
  events.

* :class:`EslEventConsumer` runs a long-lived background task that re-uses an
  EslClient connection to drain ``CHANNEL_*`` events and emits them as Python
  callbacks. The :class:`OriginateBridge` uses this to map FreeSWITCH UUIDs to
  Mongo Call docs and emit lifecycle webhooks.

This is an intentionally minimal ESL client — enough to drive the dialplan
described in ARCHITECTURE.md §5. It is not a drop-in replacement for full
greenswitch / SwiftSwitch libraries.
"""

from __future__ import annotations

import asyncio
import contextlib
import shlex
from collections.abc import AsyncIterator, Awaitable, Callable
from dataclasses import dataclass, field
from urllib.parse import unquote

import structlog

log = structlog.get_logger()


@dataclass
class EslConfig:
    host: str
    port: int
    password: str


@dataclass
class EslEvent:
    headers: dict[str, str]
    body: str = ""

    @property
    def name(self) -> str:
        return self.headers.get("Event-Name", "")

    @property
    def uuid(self) -> str:
        return (
            self.headers.get("Unique-ID")
            or self.headers.get("Channel-Call-UUID")
            or ""
        )


def _parse_headers(raw: bytes) -> dict[str, str]:
    out: dict[str, str] = {}
    for line in raw.decode("utf-8", "replace").splitlines():
        if not line or ":" not in line:
            continue
        k, _, v = line.partition(":")
        out[k.strip()] = unquote(v.strip())
    return out


def _quote_chan_var(value: str) -> str:
    """Quote a chan-var value so it survives FreeSWITCH's ``{key=val,…}`` parser.

    Inside ``{...}``, ``,`` separates entries and ``}`` terminates the block.
    Single-quoted values are parsed as a single token, so we wrap every value
    in ``'`` after stripping the few characters that would themselves break the
    inner quoting (``'``, ``}`` and ``\\n``). URLs and HMAC tokens never contain
    those, but we still strip defensively so a malicious caller can't break the
    dialplan.
    """
    safe = value.replace("'", "").replace("}", "").replace("\n", "").replace("\r", "")
    return f"'{safe}'"


def _build_chan_vars(items: dict[str, str]) -> str:
    """Render a dict into a comma-separated FS chan-var block (without braces)."""
    return ",".join(f"{k}={_quote_chan_var(v)}" for k, v in items.items())


class EslClient:
    """Single async ESL connection."""

    def __init__(self, config: EslConfig) -> None:
        self.config = config
        self.reader: asyncio.StreamReader | None = None
        self.writer: asyncio.StreamWriter | None = None
        self._lock = asyncio.Lock()

    @property
    def connected(self) -> bool:
        return self.writer is not None and not self.writer.is_closing()

    async def connect(self) -> None:
        self.reader, self.writer = await asyncio.open_connection(
            self.config.host, self.config.port
        )
        await self._read_block()  # auth/request banner
        await self._send(f"auth {self.config.password}")
        reply = await self._read_block()
        if reply.headers.get("Reply-Text", "").startswith("-ERR"):
            await self.close()
            raise RuntimeError(f"ESL auth failed: {reply.headers.get('Reply-Text')}")

    async def api(self, command: str) -> str:
        async with self._lock:
            await self._send(f"api {command}")
            block = await self._read_block()
        return block.body or block.headers.get("Reply-Text", "")

    async def bgapi(self, command: str) -> str:
        async with self._lock:
            await self._send(f"bgapi {command}")
            block = await self._read_block()
        # FS returns Reply-Text: +OK Job-UUID: <uuid>
        text = block.headers.get("Reply-Text", "")
        if "Job-UUID" in text:
            return text.split("Job-UUID:", 1)[1].strip()
        return text

    async def subscribe(self, events: list[str]) -> None:
        await self._send(f"event plain {' '.join(events)}")
        await self._read_block()

    async def originate(
        self,
        gateway: str,
        to_e164: str,
        agent_id: str,
        tier: str,
        from_e164: str,
        ws_url: str,
        call_doc_id: str,
        channel_uuid: str,
        disclosure_url: str = "",
        record_mode: str = "on",
        consent_prompt_url: str = "",
    ) -> str:
        """Issue a bgapi originate. Returns the channel UUID.

        We pre-assign the channel UUID via ``origination_uuid`` so the caller
        can hangup / transfer immediately without waiting for ``CHANNEL_CREATE``.
        The bgapi command itself returns a *job* UUID (used to correlate the
        future ``BACKGROUND_JOB`` event), which is not useful for channel
        operations.

        The dialplan extension ``livocall_park`` reads ``${livocall_ws_url}``
        and runs ``audio_fork`` against it after answering, so all the runtime
        context (agent_id, tier, call_doc_id) is encoded into the WS URL.
        """
        chan_vars = _build_chan_vars(
            {
                "origination_uuid": channel_uuid,
                "origination_caller_id_number": from_e164,
                "agent_id": agent_id,
                "tier": tier,
                "call_doc_id": call_doc_id,
                "livocall_park": "1",
                "livocall_ws_url": ws_url,
                "livocall_disclosure_url": disclosure_url,
                "livocall_record": record_mode,
                "livocall_consent_prompt": consent_prompt_url,
            }
        )
        # bridge to the gateway and route the dialplan leg into livocall_park.
        cmd = f"originate {{{chan_vars}}}sofia/gateway/{gateway}/{to_e164} &park()"
        log.info("esl.originate", to=to_e164, agent_id=agent_id, tier=tier)
        await self.bgapi(cmd)
        return channel_uuid

    async def hangup(self, uuid: str, cause: str = "NORMAL_CLEARING") -> str:
        return await self.bgapi(f"uuid_kill {shlex.quote(uuid)} {shlex.quote(cause)}")

    async def transfer(self, uuid: str, target: str) -> str:
        return await self.bgapi(f"uuid_transfer {shlex.quote(uuid)} {shlex.quote(target)}")

    async def playback(self, uuid: str, url: str) -> str:
        return await self.bgapi(f"uuid_broadcast {shlex.quote(uuid)} {shlex.quote(url)} aleg")

    async def events(self) -> AsyncIterator[EslEvent]:
        """Yield events from the connection forever. Caller must subscribe first."""
        while self.connected:
            block = await self._read_block()
            if not block.headers:
                continue
            content_type = block.headers.get("Content-Type", "")
            if content_type == "text/event-plain":
                inner = _parse_headers(block.body.encode())
                yield EslEvent(headers=inner)
            elif content_type.startswith("text/disconnect-notice"):
                return

    async def close(self) -> None:
        if self.writer is not None and not self.writer.is_closing():
            self.writer.close()
            with contextlib.suppress(Exception):
                await self.writer.wait_closed()
        self.reader = None
        self.writer = None

    # --- low-level ---

    async def _send(self, line: str) -> None:
        assert self.writer is not None
        self.writer.write(f"{line}\n\n".encode())
        await self.writer.drain()

    async def _read_block(self) -> EslEvent:
        assert self.reader is not None
        # Read header lines until blank line.
        header_chunks: list[bytes] = []
        while True:
            line = await self.reader.readline()
            if not line:
                return EslEvent(headers={})
            if line == b"\n":
                break
            header_chunks.append(line)
        headers = _parse_headers(b"".join(header_chunks))
        # Read body if Content-Length is present
        cl = int(headers.get("Content-Length", "0") or "0")
        body = ""
        if cl > 0:
            buf = await self.reader.readexactly(cl)
            body = buf.decode("utf-8", "replace")
        return EslEvent(headers=headers, body=body)


EventCallback = Callable[[EslEvent], Awaitable[None]]


@dataclass
class EslEventConsumer:
    """Long-lived event drainer with reconnect."""

    config: EslConfig
    callbacks: list[EventCallback] = field(default_factory=list)
    events: list[str] = field(
        default_factory=lambda: [
            "CHANNEL_CREATE",
            "CHANNEL_ANSWER",
            "CHANNEL_HANGUP_COMPLETE",
            "CHANNEL_BRIDGE",
            "DTMF",
            "CUSTOM",
        ]
    )
    _task: asyncio.Task[None] | None = None
    _stopping: bool = False

    def start(self) -> None:
        if self._task is None or self._task.done():
            self._task = asyncio.create_task(self._run(), name="esl-consumer")

    async def stop(self) -> None:
        self._stopping = True
        if self._task is not None:
            self._task.cancel()
            with contextlib.suppress(asyncio.CancelledError):
                await self._task

    async def _run(self) -> None:
        backoff = 1.0
        while not self._stopping:
            client = EslClient(self.config)
            try:
                await client.connect()
                await client.subscribe(self.events)
                backoff = 1.0
                async for ev in client.events():
                    for cb in self.callbacks:
                        try:
                            await cb(ev)
                        except Exception:  # noqa: BLE001
                            log.exception("esl.callback_error", event=ev.name)
            except asyncio.CancelledError:
                raise
            except Exception:  # noqa: BLE001
                log.exception("esl.consumer_error", retry_in=backoff)
            finally:
                await client.close()
            if self._stopping:
                break
            await asyncio.sleep(backoff)
            backoff = min(30.0, backoff * 2)
