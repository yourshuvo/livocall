from __future__ import annotations

import asyncio
import hashlib
import json
from typing import Any
from urllib.parse import urlparse

import httpx
import structlog
from bson import ObjectId

from app.db import get_db
from app.settings import settings
from app.workers.kb_ingestion import _embed_with_gemini, _hash_embedding

log = structlog.get_logger()

GEMINI_LIVE_MODEL_ALIASES = {
    "gemini-3.1-flash-live": "models/gemini-3.1-flash-live-preview",
    "gemini-3.1-flash-live-preview": "models/gemini-3.1-flash-live-preview",
    "models/gemini-3.1-flash-live-preview": "models/gemini-3.1-flash-live-preview",
    "gemini-2.5-flash-live": "models/gemini-3.1-flash-live-preview",
    "gemini-2.0-flash-live": "models/gemini-3.1-flash-live-preview",
}

PIPELINE_MODEL_ALIASES = {
    "gemini-3.1-flash": "gemini-3.1-flash",
    "models/gemini-3.1-flash": "gemini-3.1-flash",
    "gemini-2.5-flash": "gemini-3.1-flash",
    "gpt-4.1": "gemini-3.1-flash",
    "gpt-4o-mini": "gemini-3.1-flash",
    "claude-3.5-sonnet": "gemini-3.1-flash",
}

GEMINI_VOICE_ALIASES = {
    "aoede": "Aoede",
    "charon": "Charon",
    "fenrir": "Fenrir",
    "kore": "Kore",
    "puck": "Puck",
    "gemini-live:aoede": "Aoede",
    "gemini-live:charon": "Charon",
    "gemini-live:fenrir": "Fenrir",
    "gemini-live:kore": "Kore",
    "gemini-live:puck": "Puck",
}

GROK_VOICE_MODEL_ALIASES = {
    "grok-voice-think-fast": "grok-voice-think-fast-1.0",
    "grok-voice-think-fast-1.0": "grok-voice-think-fast-1.0",
    "grok-voice-fast": "grok-voice-fast-1.0",
    "grok-voice-fast-1.0": "grok-voice-fast-1.0",
}

GROK_VOICE_ALIASES = {
    "xai:rohan": "rohan",
    "xai:pooja": "pooja",
    "xai:anika": "anika",
    "xai:tanvir": "tanvir",
}


def prompt_parts(agent: dict[str, Any], override: str = "") -> tuple[str, str]:
    prompt_doc = agent.get("prompt") if isinstance(agent.get("prompt"), dict) else {}
    system_prompt = override or str(agent.get("systemPrompt") or prompt_doc.get("system") or "")
    first_message = str(prompt_doc.get("firstMessage") or agent.get("firstMessage") or "")
    return system_prompt, first_message


def runtime_settings(agent: dict[str, Any]) -> dict[str, Any]:
    value = agent.get("runtimeSettings")
    return value if isinstance(value, dict) else {}


def runtime_float(agent: dict[str, Any], key: str, default: float) -> float:
    try:
        return float(runtime_settings(agent).get(key, default))
    except (TypeError, ValueError):
        return default


def runtime_int(agent: dict[str, Any], key: str, default: int) -> int:
    return int(runtime_float(agent, key, default))


def runtime_bool(agent: dict[str, Any], key: str, default: bool) -> bool:
    value = runtime_settings(agent).get(key)
    if value is None:
        return default
    if isinstance(value, bool):
        return value
    return str(value).strip().lower() in {"1", "true", "yes", "on"}


def gemini_live_vad_silence_ms(agent: dict[str, Any]) -> int:
    value = runtime_int(agent, "geminiLiveVadSilenceMs", settings.gemini_live_vad_silence_ms)
    return max(300, min(2000, value))


def gemini_live_vad_prefix_padding_ms(agent: dict[str, Any]) -> int:
    value = runtime_int(
        agent,
        "geminiLiveVadPrefixPaddingMs",
        settings.gemini_live_vad_prefix_padding_ms,
    )
    return max(0, min(1000, value))


def gemini_kb_tool_timeout_ms(agent: dict[str, Any]) -> int:
    value = runtime_int(agent, "geminiKbToolTimeoutMs", settings.gemini_kb_tool_timeout_ms)
    return max(300, min(5000, value))


def gemini_memory_enabled(agent: dict[str, Any]) -> bool:
    return settings.gemini_memory_enabled and runtime_bool(agent, "geminiMemoryEnabled", True)


def gemini_live_model(agent: dict[str, Any]) -> str:
    raw = str(agent.get("model") or settings.gemini_live_model).strip()
    if raw in GEMINI_LIVE_MODEL_ALIASES:
        return GEMINI_LIVE_MODEL_ALIASES[raw]
    return raw if raw.startswith("models/") else f"models/{raw}"


def pipeline_model(agent: dict[str, Any]) -> str:
    raw = str(agent.get("model") or settings.pipeline_llm_model).strip()
    return PIPELINE_MODEL_ALIASES.get(raw, raw)


def gemini_voice(agent: dict[str, Any]) -> str:
    voice = agent.get("voice") if isinstance(agent.get("voice"), dict) else {}
    raw = str(voice.get("voiceId") or voice.get("id") or settings.gemini_live_voice).strip()
    return GEMINI_VOICE_ALIASES.get(raw.lower(), raw)


def grok_voice_model(agent: dict[str, Any]) -> str:
    raw = str(agent.get("model") or settings.grok_voice_model).strip()
    return GROK_VOICE_MODEL_ALIASES.get(raw, raw)


def grok_voice(agent: dict[str, Any]) -> str:
    voice = agent.get("voice") if isinstance(agent.get("voice"), dict) else {}
    raw = str(voice.get("voiceId") or voice.get("id") or settings.grok_voice_voice).strip()
    return GROK_VOICE_ALIASES.get(raw.lower(), raw)


def grok_language(agent: dict[str, Any]) -> str:
    raw = str(agent.get("language") or settings.grok_voice_language).strip()
    if raw in {"bn-BD", "bn-en-mixed"}:
        return "bn"
    if raw == "en-US":
        return "en"
    return raw or settings.grok_voice_language


def cartesia_voice_id(agent: dict[str, Any]) -> str:
    voice = agent.get("voice") if isinstance(agent.get("voice"), dict) else {}
    raw = str(voice.get("voiceId") or settings.cartesia_voice_id).strip()
    if raw.startswith("cartesia:"):
        return raw.split(":", 1)[1]
    return raw


async def knowledge_context(agent: dict[str, Any], *, query: str = "", limit: int = 4) -> str:
    ids = [x for x in agent.get("knowledgeBaseIds") or [] if ObjectId.is_valid(str(x))]
    if not ids:
        return ""
    db = get_db()
    kb_ids = [ObjectId(str(x)) for x in ids]
    projection = {"text": 1, "sourceRef": 1, "chunkIndex": 1, "embedding": 1}
    chunks: list[dict[str, Any]] = []
    if query:
        qvec = await _embed_query(query)
        if qvec:
            cursor = db["kb_chunks"].find({"kbId": {"$in": kb_ids}}, projection)
            scored: list[tuple[float, dict[str, Any]]] = []
            async for chunk in cursor:
                score = _cosine(qvec, chunk.get("embedding") or [])
                scored.append((score, chunk))
            chunks = [c for _, c in sorted(scored, key=lambda x: x[0], reverse=True)[:limit]]
    if not chunks:
        cursor = db["kb_chunks"].find({"kbId": {"$in": kb_ids}}, projection).sort("chunkIndex", 1).limit(limit)
        async for chunk in cursor:
            chunks.append(chunk)
    if not chunks:
        return ""
    lines = []
    for i, chunk in enumerate(chunks, start=1):
        source = str(chunk.get("sourceRef") or "knowledge")
        text = " ".join(str(chunk.get("text") or "").split())[:900]
        if text:
            lines.append(f"[{i}] {source}: {text}")
    if not lines:
        return ""
    return "Relevant knowledge base context:\n" + "\n".join(lines)


async def gemini_memory_context(agent: dict[str, Any]) -> str:
    if not gemini_memory_enabled(agent) or not agent.get("knowledgeBaseIds"):
        return ""
    stored = agent.get("geminiMemory") if isinstance(agent.get("geminiMemory"), dict) else {}
    status = str(stored.get("status") or "")
    text = str(stored.get("text") or "").strip()
    if status == "ready" and text:
        return _format_gemini_memory(text)
    return await _build_and_store_gemini_memory(agent)


async def build_system_prompt(agent: dict[str, Any], override: str = "", *, kb_query: str = "") -> str:
    system_prompt, first_message = prompt_parts(agent, override)
    runtime = runtime_settings(agent)
    prompt_doc = agent.get("prompt") if isinstance(agent.get("prompt"), dict) else {}
    guardrails = str(prompt_doc.get("guardrails") or "")
    if not system_prompt:
        system_prompt = (
            "You are on a live phone call. Reply immediately after the caller stops. "
            "Keep replies under one short sentence unless required. Ask one question at a time."
        )
    system_prompt = (
        f"{system_prompt}\n\nLatency rule: this is a live phone call. Start answering immediately, "
        "keep most replies under one short sentence, and never silently wait on slow tools. "
        'If a lookup may take time, first say "one moment, I am checking..." then use the tool.'
    )
    memory = await gemini_memory_context(agent)
    if memory:
        system_prompt = (
            f"{system_prompt}\n\n{memory}\n"
            "Knowledge rule: answer factual business questions from Gemini memory first. "
            "Only use search_knowledge_base if the answer is missing, ambiguous, or needs exact detail."
        )
    else:
        kb = await knowledge_context(agent, query=kb_query, limit=4)
        if kb:
            system_prompt = (
                f"{system_prompt}\n\n{kb}\n"
                "Knowledge rule: answer factual business questions from this context when possible. "
                "Only use search_knowledge_base if the answer is missing, ambiguous, or needs exact detail."
            )
    tools = tool_context(agent)
    if tools:
        system_prompt = f"{system_prompt}\n\n{tools}"
    handoff_target = str(runtime.get("handoffTarget") or "").strip()
    handoff_rules = str(runtime.get("handoffRules") or "").strip()
    if handoff_target or handoff_rules:
        system_prompt = (
            f"{system_prompt}\n\nHandoff rules:\n"
            f"Target: {handoff_target or 'configured human queue'}\n"
            f"{handoff_rules or 'Offer handoff when the caller asks for a person or the request is outside scope.'}"
        )
    if guardrails:
        system_prompt = f"{system_prompt}\n\nGuardrails:\n{guardrails}"
    pause_sec = runtime_float(agent, "pauseBeforeSpeakingSec", 0)
    if pause_sec > 0:
        system_prompt = f"{system_prompt}\n\nOpening timing: wait about {pause_sec:g} seconds before speaking first."
    welcome_mode = str(runtime.get("welcomeMode") or "ai")
    if first_message and welcome_mode == "ai":
        system_prompt = (
            f"{system_prompt}\n\nWhen the call connects, start with this exact opening "
            f"unless the caller speaks first: {first_message}"
        )
    elif welcome_mode == "caller":
        system_prompt = f"{system_prompt}\n\nOpening behavior: let the caller speak first, then respond naturally."
    elif welcome_mode == "silent":
        system_prompt = f"{system_prompt}\n\nOpening behavior: stay silent until the caller speaks or the dialplan prompts you."
    return system_prompt


def configured_tools(agent: dict[str, Any]) -> list[dict[str, Any]]:
    out = []
    for item in agent.get("tools") or []:
        if not isinstance(item, dict):
            continue
        name = _tool_name(str(item.get("name") or ""))
        url = str(item.get("url") or "")
        if not name or not url or item.get("enabled") is False:
            continue
        out.append({**item, "name": name, "url": url})
    return out


def tool_context(agent: dict[str, Any]) -> str:
    tools = configured_tools(agent)
    if not tools:
        return ""
    lines = ["Available tools. Use only when needed and summarize the result briefly:"]
    for tool in tools:
        name = str(tool["name"])
        description = str(tool.get("description") or "HTTP lookup/action")
        method = str(tool.get("method") or "POST").upper()
        lines.append(f"- {name}: {description} ({method})")
    return "\n".join(lines)


def gemini_tool_declarations(agent: dict[str, Any]) -> list[dict[str, Any]]:
    declarations = []
    if agent.get("knowledgeBaseIds"):
        declarations.append(
            {
                "name": "search_knowledge_base",
                "description": (
                    "Search the agent knowledge base for current caller question context. "
                    "Use only when Gemini memory or provided context is missing, ambiguous, or needs exact detail."
                ),
                "parameters": {
                    "type": "OBJECT",
                    "properties": {
                        "query": {"type": "STRING", "description": "The caller question to answer"},
                    },
                    "required": ["query"],
                },
            }
        )
    for tool in configured_tools(agent):
        declarations.append(
            {
                "name": str(tool["name"]),
                "description": str(tool.get("description") or "HTTP lookup/action"),
                "parameters": {
                    "type": "OBJECT",
                    "properties": {
                        "query": {"type": "STRING", "description": "Caller request or lookup key"},
                        "phone": {"type": "STRING", "description": "Caller phone number when useful"},
                        "notes": {"type": "STRING", "description": "Short context for the tool"},
                    },
                },
            }
        )
    return declarations


async def execute_agent_tool(
    agent: dict[str, Any],
    *,
    call_id: str,
    name: str,
    arguments: dict[str, Any],
) -> dict[str, Any]:
    started = _now()
    if _tool_name(name) == "search_knowledge_base":
        query = str(arguments.get("query") or arguments.get("notes") or "")
        try:
            context = await asyncio.wait_for(
                knowledge_context(agent, query=query, limit=5),
                timeout=gemini_kb_tool_timeout_ms(agent) / 1000,
            )
            result = {
                "ok": bool(context),
                "answer": context or "I need to check that and follow up.",
                "context": context,
                "source": "vector" if context else "missing",
                "answerPolicy": "answer from context; if missing, say you need to check",
            }
        except TimeoutError:
            result = {
                "ok": False,
                "error": "knowledge base lookup timed out",
                "answer": "I need to check that and follow up.",
                "source": "timeout",
            }
        except Exception as exc:  # noqa: BLE001
            result = {
                "ok": False,
                "error": str(exc)[:300],
                "answer": "I need to check that and follow up.",
                "source": "error",
            }
        await _log_tool_call(agent, call_id, "search_knowledge_base", _redact(arguments), result, started_at=started)
        return result
    tool = next((t for t in configured_tools(agent) if t["name"] == _tool_name(name)), None)
    if tool is None:
        result = {"ok": False, "error": f"tool {name} is not configured"}
        await _log_tool_call(agent, call_id, name, _redact(arguments), result, started)
        return result

    method = str(tool.get("method") or "POST").upper()
    timeout_ms = int(tool.get("timeoutMs") or 5000)
    headers = _tool_headers(tool)
    url = str(tool["url"])
    if not _url_allowed(url, tool):
        result = {"ok": False, "error": "tool URL host is not allowlisted"}
        await _log_tool_call(agent, call_id, str(tool["name"]), _redact(arguments), result, started)
        return result
    attempts = max(1, min(3, int(tool.get("retries") or 1)))
    try:
        async with httpx.AsyncClient(timeout=max(0.5, timeout_ms / 1000)) as client:
            response = None
            for attempt in range(attempts):
                if method == "GET":
                    response = await client.get(url, params=_string_dict(arguments), headers=headers)
                else:
                    response = await client.request(method, url, json=arguments, headers=headers)
                if response.status_code < 500 or attempt == attempts - 1:
                    break
            if response is None:
                raise RuntimeError("tool request was not sent")
        text = response.text[:4000]
        result = {
            "ok": 200 <= response.status_code < 300,
            "status": response.status_code,
            "body": text,
        }
    except Exception as exc:  # noqa: BLE001
        result = {"ok": False, "error": str(exc)[:500]}
    await _log_tool_call(agent, call_id, str(tool["name"]), _redact(arguments), _redact(result), started)
    return result


def _tool_name(value: str) -> str:
    return "".join(ch if ch.isalnum() or ch == "_" else "_" for ch in value.strip())[:64]


def _string_dict(value: Any) -> dict[str, str]:
    if not isinstance(value, dict):
        return {}
    return {str(k): str(v) for k, v in value.items() if isinstance(k, str) and v is not None}


def _tool_headers(tool: dict[str, Any]) -> dict[str, str]:
    headers = _string_dict(tool.get("headers"))
    auth_header = str(tool.get("authHeader") or "").strip()
    auth_value = str(tool.get("authValue") or "").strip()
    if auth_header and auth_value:
        headers[auth_header] = auth_value
    return headers


def _url_allowed(url: str, tool: dict[str, Any]) -> bool:
    allowed = [str(x).lower() for x in tool.get("allowedDomains") or [] if str(x).strip()]
    if not allowed:
        return True
    host = (urlparse(url).hostname or "").lower()
    return any(host == domain or host.endswith(f".{domain}") for domain in allowed)


def _redact(value: Any) -> Any:
    if isinstance(value, dict):
        redacted: dict[str, Any] = {}
        for k, v in value.items():
            key = str(k).lower()
            if any(s in key for s in ("authorization", "token", "secret", "password", "api_key", "apikey")):
                redacted[str(k)] = "[redacted]"
            else:
                redacted[str(k)] = _redact(v)
        return redacted
    if isinstance(value, list):
        return [_redact(v) for v in value]
    return value


def _now() -> str:
    from datetime import UTC, datetime

    return datetime.now(UTC).isoformat()


def _format_gemini_memory(text: str) -> str:
    return (
        "Gemini memory for low-latency answers. Use this before tools:\n"
        f"{text.strip()}"
    )


async def _build_and_store_gemini_memory(agent: dict[str, Any]) -> str:
    ids = [x for x in agent.get("knowledgeBaseIds") or [] if ObjectId.is_valid(str(x))]
    if not ids:
        return ""
    db = get_db()
    kb_ids = [ObjectId(str(x)) for x in ids]
    chunks: list[dict[str, Any]] = []
    cursor = (
        db["kb_chunks"]
        .find({"kbId": {"$in": kb_ids}}, {"text": 1, "sourceRef": 1, "chunkIndex": 1})
        .sort([("sourceRef", 1), ("chunkIndex", 1)])
        .limit(40)
    )
    async for chunk in cursor:
        text = " ".join(str(chunk.get("text") or "").split())
        if text:
            chunks.append(
                {
                    "sourceRef": str(chunk.get("sourceRef") or "knowledge"),
                    "chunkIndex": int(chunk.get("chunkIndex") or 0),
                    "text": text,
                }
            )
    if not chunks:
        await _store_gemini_memory(agent, status="failed", text="", source_hash="")
        return ""

    source_hash = _gemini_memory_source_hash(agent, chunks)
    text = _compact_gemini_memory(chunks, max_chars=settings.gemini_memory_max_chars)
    if text:
        await _store_gemini_memory(agent, status="ready", text=text, source_hash=source_hash)
        return _format_gemini_memory(text)
    await _store_gemini_memory(agent, status="failed", text="", source_hash=source_hash)
    return ""


def _compact_gemini_memory(chunks: list[dict[str, Any]], *, max_chars: int) -> str:
    budget = max(1200, min(12000, max_chars))
    lines: list[str] = []
    used = 0
    for chunk in chunks:
        source = str(chunk.get("sourceRef") or "knowledge")[:120]
        text = str(chunk.get("text") or "")
        for sentence in _memory_sentences(text):
            line = f"- {source}: {sentence}"
            if used + len(line) + 1 > budget:
                return "\n".join(lines)
            lines.append(line)
            used += len(line) + 1
            break
    return "\n".join(lines)


def _memory_sentences(text: str) -> list[str]:
    cleaned = " ".join(text.split())
    if not cleaned:
        return []
    pieces = []
    current = []
    for char in cleaned:
        current.append(char)
        if char in ".!?":
            sentence = "".join(current).strip()
            if sentence:
                pieces.append(sentence[:500])
            current = []
        if len("".join(current)) >= 500:
            sentence = "".join(current).strip()
            if sentence:
                pieces.append(sentence)
            current = []
    tail = "".join(current).strip()
    if tail:
        pieces.append(tail[:500])
    return pieces or [cleaned[:500]]


def _gemini_memory_source_hash(agent: dict[str, Any], chunks: list[dict[str, Any]]) -> str:
    prompt_doc = agent.get("prompt") if isinstance(agent.get("prompt"), dict) else {}
    payload = {
        "prompt": {
            "system": str(prompt_doc.get("system") or agent.get("systemPrompt") or ""),
            "firstMessage": str(prompt_doc.get("firstMessage") or agent.get("firstMessage") or ""),
            "guardrails": str(prompt_doc.get("guardrails") or ""),
        },
        "knowledgeBaseIds": [str(x) for x in agent.get("knowledgeBaseIds") or []],
        "chunks": chunks,
    }
    raw = json.dumps(payload, sort_keys=True, ensure_ascii=True)
    return hashlib.sha256(raw.encode("utf-8")).hexdigest()


async def _store_gemini_memory(
    agent: dict[str, Any],
    *,
    status: str,
    text: str,
    source_hash: str,
) -> None:
    agent_id = agent.get("_id")
    if not ObjectId.is_valid(str(agent_id)):
        return
    memory = {
        "status": status,
        "text": text,
        "sourceHash": source_hash,
        "updatedAt": _now(),
        "cacheName": "",
        "cacheModel": "",
        "cacheExpiresAt": None,
    }
    agent["geminiMemory"] = memory
    try:
        await get_db()["agents"].update_one({"_id": ObjectId(str(agent_id))}, {"$set": {"geminiMemory": memory}})
    except Exception as exc:  # noqa: BLE001
        log.warning("gemini_memory.store_failed", agent_id=str(agent_id), error=str(exc))


async def _log_tool_call(
    agent: dict[str, Any],
    call_id: str,
    name: str,
    arguments: dict[str, Any],
    result: dict[str, Any],
    started_at: str,
) -> None:
    if not ObjectId.is_valid(call_id):
        return
    try:
        db = get_db()
        await db["calls"].update_one(
            {"_id": ObjectId(call_id), "orgId": agent.get("orgId")},
            {
                "$push": {
                    "toolCalls": {
                        "name": name,
                        "arguments": arguments,
                        "result": result,
                        "ok": bool(result.get("ok")),
                        "startedAt": started_at,
                        "endedAt": _now(),
                    }
                }
            },
        )
    except Exception as exc:  # noqa: BLE001
        log.warning("tool_call.log_failed", call_id=call_id, name=name, error=str(exc))


async def _embed_query(text: str) -> list[float]:
    if not settings.gemini_api_key:
        return _hash_embedding(text)
    try:
        async with httpx.AsyncClient() as client:
            return await _embed_with_gemini(client, text)
    except Exception:
        return _hash_embedding(text)


def _cosine(a: list[float], b: list[Any]) -> float:
    vals_b = [float(x) for x in b if isinstance(x, int | float)]
    if not a or not vals_b:
        return 0.0
    n = min(len(a), len(vals_b))
    dot = sum(a[i] * vals_b[i] for i in range(n))
    an = sum(a[i] * a[i] for i in range(n)) ** 0.5
    bn = sum(vals_b[i] * vals_b[i] for i in range(n)) ** 0.5
    if not an or not bn:
        return 0.0
    return dot / (an * bn)
