from __future__ import annotations

from time import perf_counter_ns

import structlog

log = structlog.get_logger()


def now_ms() -> float:
    return perf_counter_ns() / 1_000_000


class LatencyTrace:
    def __init__(self, call_id: str) -> None:
        self.call_id = call_id
        self.marks: dict[str, float] = {}

    def mark(self, name: str) -> None:
        self.marks[name] = now_ms()
        log.info("latency.mark", call_id=self.call_id, name=name)

    def emit_delta(self, start: str, end: str, name: str) -> None:
        if start not in self.marks or end not in self.marks:
            return
        log.info(
            "latency.delta",
            call_id=self.call_id,
            name=name,
            ms=round(self.marks[end] - self.marks[start], 2),
        )
