from __future__ import annotations

import asyncio
from typing import Any

import pytest

from app import agent_runtime


def test_gemini_live_vad_silence_default_and_clamp(monkeypatch: pytest.MonkeyPatch) -> None:
    monkeypatch.setattr(agent_runtime.settings, "gemini_live_vad_silence_ms", 600)

    assert agent_runtime.gemini_live_vad_silence_ms({}) == 600
    assert (
        agent_runtime.gemini_live_vad_silence_ms(
            {"runtimeSettings": {"geminiLiveVadSilenceMs": 250}}
        )
        == 500
    )
    assert (
        agent_runtime.gemini_live_vad_silence_ms(
            {"runtimeSettings": {"geminiLiveVadSilenceMs": 5000}}
        )
        == 2000
    )


def test_pipeline_provider_helpers_default_and_sanitize(monkeypatch: pytest.MonkeyPatch) -> None:
    monkeypatch.setattr(agent_runtime.settings, "pipeline_stt_provider", "soniox")
    monkeypatch.setattr(agent_runtime.settings, "pipeline_tts_provider", "soniox")
    monkeypatch.setattr(agent_runtime.settings, "soniox_tts_voice", "Adrian")

    assert agent_runtime.pipeline_stt_provider({}) == "soniox"
    assert (
        agent_runtime.pipeline_stt_provider({"runtimeSettings": {"sttProvider": "deepgram"}})
        == "deepgram"
    )
    assert (
        agent_runtime.pipeline_stt_provider({"runtimeSettings": {"sttProvider": "bogus"}})
        == "soniox"
    )
    assert agent_runtime.pipeline_tts_provider({"voice": {"provider": "cartesia"}}) == "cartesia"
    assert agent_runtime.pipeline_tts_provider({"voice": {"provider": "eleven"}}) == "soniox"


def test_soniox_voice_and_language_mapping(monkeypatch: pytest.MonkeyPatch) -> None:
    monkeypatch.setattr(agent_runtime.settings, "soniox_tts_voice", "Adrian")
    monkeypatch.setattr(agent_runtime.settings, "soniox_language", "bn")

    assert agent_runtime.soniox_voice({"voice": {"voiceId": "soniox:ava"}}) == "Ava"
    assert agent_runtime.soniox_voice({"voice": {"voiceId": "Custom Voice"}}) == "Custom Voice"
    assert agent_runtime.soniox_language({"language": "bn-en-mixed"}) == "bn"
    assert agent_runtime.soniox_language({"language": "en-US"}) == "en"
    assert agent_runtime.soniox_language_hint_codes({"language": "bn-en-mixed"}) == ["bn", "en"]


@pytest.mark.asyncio
async def test_build_system_prompt_prefers_stored_gemini_memory(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    async def fail_knowledge_context(*args: Any, **kwargs: Any) -> str:
        raise AssertionError("vector KB lookup should not run for ready Gemini memory")

    monkeypatch.setattr(agent_runtime, "knowledge_context", fail_knowledge_context)
    agent = {
        "knowledgeBaseIds": ["64b64b64b64b64b64b64b64b"],
        "prompt": {"system": "You are concise."},
        "geminiMemory": {
            "status": "ready",
            "text": "- office: Our office is in Kurigram.",
        },
    }

    prompt = await agent_runtime.build_system_prompt(agent)

    assert "Gemini memory for low-latency answers" in prompt
    assert "Kurigram" in prompt
    assert "answer factual business questions from Gemini memory first" in prompt


@pytest.mark.asyncio
async def test_build_system_prompt_uses_ready_gemini_memory_without_kb_ids(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    async def fail_knowledge_context(*args: Any, **kwargs: Any) -> str:
        raise AssertionError("public built-in memory should not need vector KB IDs")

    monkeypatch.setattr(agent_runtime, "knowledge_context", fail_knowledge_context)
    agent = {
        "prompt": {"system": "You are concise."},
        "runtimeSettings": {"geminiMemoryEnabled": True},
        "geminiMemory": {
            "status": "ready",
            "text": "- office: Our office is in Kurigram.",
        },
    }

    prompt = await agent_runtime.build_system_prompt(agent)

    assert "Gemini memory for low-latency answers" in prompt
    assert "Kurigram" in prompt


@pytest.mark.asyncio
async def test_build_system_prompt_adds_bangla_only_rule_for_gemini_live(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    async def no_memory(*args: Any, **kwargs: Any) -> str:
        return ""

    monkeypatch.setattr(agent_runtime, "gemini_memory_context", no_memory)
    monkeypatch.setattr(agent_runtime, "knowledge_context", no_memory)

    prompt = await agent_runtime.build_system_prompt(
        {
            "tier": "gemini_live",
            "language": "bn",
            "prompt": {"system": "You are concise."},
        }
    )

    assert "Language rule: speak only Bangla/Bengali." in prompt
    assert "Do not switch to English" in prompt
    assert "Do not repeat the caller's words verbatim" in prompt


@pytest.mark.asyncio
async def test_execute_agent_tool_times_out_kb_lookup(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    async def slow_knowledge_context(*args: Any, **kwargs: Any) -> str:
        await asyncio.sleep(1)
        return "too late"

    async def no_log(*args: Any, **kwargs: Any) -> None:
        return None

    monkeypatch.setattr(agent_runtime, "knowledge_context", slow_knowledge_context)
    monkeypatch.setattr(agent_runtime, "gemini_kb_tool_timeout_ms", lambda _agent: 1)
    monkeypatch.setattr(agent_runtime, "_log_tool_call", no_log)

    result = await agent_runtime.execute_agent_tool(
        {"knowledgeBaseIds": ["64b64b64b64b64b64b64b64b"]},
        call_id="64b64b64b64b64b64b64b64b",
        name="search_knowledge_base",
        arguments={"query": "where is your office?"},
    )

    assert result["ok"] is False
    assert result["source"] == "timeout"
    assert result["answer"] == "I need to check that and follow up."


@pytest.mark.asyncio
async def test_execute_agent_tool_returns_vector_context(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    async def fake_knowledge_context(*args: Any, **kwargs: Any) -> str:
        return "Relevant knowledge base context:\n[1] Our office is in Kurigram."

    async def no_log(*args: Any, **kwargs: Any) -> None:
        return None

    monkeypatch.setattr(agent_runtime, "knowledge_context", fake_knowledge_context)
    monkeypatch.setattr(agent_runtime, "_log_tool_call", no_log)

    result = await agent_runtime.execute_agent_tool(
        {"knowledgeBaseIds": ["64b64b64b64b64b64b64b64b"]},
        call_id="64b64b64b64b64b64b64b64b",
        name="search_knowledge_base",
        arguments={"query": "where is your office?"},
    )

    assert result["ok"] is True
    assert result["source"] == "vector"
    assert "Kurigram" in result["answer"]
