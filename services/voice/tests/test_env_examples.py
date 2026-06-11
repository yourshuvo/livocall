from __future__ import annotations

from pathlib import Path

ROOT = Path(__file__).resolve().parents[3]


def test_voice_env_examples_include_default_soniox_pipeline_key() -> None:
    for relative_path in [
        "services/voice/.env.example",
        "infra/.env.prod.example",
        "infra/docker-compose.prod.yml",
    ]:
        content = (ROOT / relative_path).read_text()
        assert "SONIOX_API_KEY" in content, f"{relative_path} must wire Soniox for default pipeline"


def test_voice_env_example_matches_flash_lite_pipeline_default() -> None:
    content = (ROOT / "services/voice/.env.example").read_text()

    assert "PIPELINE_LLM_MODEL=gemini-2.5-flash-lite" in content
    assert "PIPELINE_STT_PROVIDER=soniox" in content
    assert "PIPELINE_TTS_PROVIDER=soniox" in content
