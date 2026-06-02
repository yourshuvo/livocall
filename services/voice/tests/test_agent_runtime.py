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
        == 300
    )
    assert (
        agent_runtime.gemini_live_vad_silence_ms(
            {"runtimeSettings": {"geminiLiveVadSilenceMs": 5000}}
        )
        == 2000
    )


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
