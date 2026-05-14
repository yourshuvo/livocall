"""Per-call cost computation."""

from __future__ import annotations

import pytest

from app.billing import compute_cost
from app.settings import rate_paisa_per_min, settings


@pytest.mark.parametrize(
    "tier,duration_sec,expected_minutes",
    [
        ("gemini_live", 30, 1),
        ("gemini_live", 60, 1),
        ("gemini_live", 61, 2),
        ("grok_voice", 30, 1),
        ("pipeline", 0, 0),
        ("pipeline", 1, 1),
        ("dtmf", 119, 2),
        ("dtmf", 120, 2),
    ],
)
def test_compute_cost_rounds_up(tier: str, duration_sec: int, expected_minutes: int) -> None:
    cb = compute_cost(tier, duration_sec)
    expected_total = expected_minutes * rate_paisa_per_min(tier)
    assert cb.total_paisa == expected_total


def test_compute_cost_zero_when_no_duration() -> None:
    cb = compute_cost("gemini_live", 0)
    assert cb.total_paisa == 0
    assert cb.stt_paisa == 0


def test_unknown_tier_raises() -> None:
    with pytest.raises(ValueError):
        rate_paisa_per_min("nonsense")


def test_split_components_sum_to_total() -> None:
    cb = compute_cost("pipeline", 90)
    assert cb.stt_paisa + cb.llm_paisa + cb.tts_paisa + cb.sip_paisa == cb.total_paisa


def test_settings_defaults_match_architecture() -> None:
    # Sanity: ARCHITECTURE.md §7 lists ৳5.50–7.20/min for T1 (gemini_live), ৳3.30–6.40 for T2,
    # and ৳1.20–2.10 for T3. The defaults sit inside each band.
    assert 550 <= settings.rate_paisa_per_min_gemini_live <= 720
    assert settings.rate_paisa_per_min_grok_voice == 700
    assert 330 <= settings.rate_paisa_per_min_pipeline <= 640
    assert 120 <= settings.rate_paisa_per_min_dtmf <= 210
