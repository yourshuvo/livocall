from __future__ import annotations

from typing import Any

from app.agent_runtime import (
    gemini_live_vad_prefix_padding_ms,
    gemini_live_vad_silence_ms,
    gemini_tool_declarations,
)
from app.settings import settings


def live_config(
    types: Any,
    system_prompt: str,
    voice: str,
    agent: dict[str, Any],
    *,
    session_resumption_handle: str | None = None,
) -> dict[str, Any]:
    config: dict[str, Any] = {
        "response_modalities": ["AUDIO"],
        "input_audio_transcription": {},
        "output_audio_transcription": {},
        "system_instruction": system_prompt,
        "temperature": settings.gemini_live_temperature,
        "max_output_tokens": settings.gemini_live_max_tokens,
        "speech_config": {
            "voice_config": {"prebuilt_voice_config": {"voice_name": voice}}
        },
        "realtime_input_config": {
            "automatic_activity_detection": {
                "disabled": False,
                "prefix_padding_ms": gemini_live_vad_prefix_padding_ms(agent),
                "silence_duration_ms": gemini_live_vad_silence_ms(agent),
            }
        },
    }
    if settings.gemini_live_context_compression_enabled:
        config["context_window_compression"] = {"sliding_window": {}}
    config["session_resumption"] = {"handle": session_resumption_handle}
    declarations = gemini_tool_declarations(agent)
    if declarations:
        config["tools"] = [{"function_declarations": declarations}]
    thinking_config = getattr(types, "ThinkingConfig", None)
    if thinking_config is not None:
        config["thinking_config"] = {"thinking_level": "minimal"}
    return config
