from __future__ import annotations

from dataclasses import dataclass
from math import ceil

from app.settings import rate_paisa_per_min


@dataclass(frozen=True)
class CostBreakdown:
    stt_paisa: int
    llm_paisa: int
    tts_paisa: int
    sip_paisa: int

    @property
    def total_paisa(self) -> int:
        return self.stt_paisa + self.llm_paisa + self.tts_paisa + self.sip_paisa

    def to_dict(self) -> dict[str, int]:
        return {
            "sttPaisa": self.stt_paisa,
            "llmPaisa": self.llm_paisa,
            "ttsPaisa": self.tts_paisa,
            "sipPaisa": self.sip_paisa,
            "totalPaisa": self.total_paisa,
        }


def compute_cost(tier: str, duration_sec: int) -> CostBreakdown:
    minutes = 0 if duration_sec <= 0 else ceil(duration_sec / 60)
    total = minutes * rate_paisa_per_min(tier)
    if total <= 0:
        return CostBreakdown(0, 0, 0, 0)

    if tier == "dtmf":
        tts = total // 4
        return CostBreakdown(0, 0, tts, total - tts)

    if tier == "pipeline":
        stt = total * 25 // 100
        llm = total * 25 // 100
        tts = total * 35 // 100
        return CostBreakdown(stt, llm, tts, total - stt - llm - tts)

    llm = total * 55 // 100
    tts = total * 25 // 100
    return CostBreakdown(0, llm, tts, total - llm - tts)
