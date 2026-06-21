from __future__ import annotations

from app.settings import settings
from app.telephony.edge import OriginateParams, SupervisorParams, TelephonyEdge
from app.telephony.pjsip_edge import PjsipEdge

_edge: TelephonyEdge | None = None


def get_edge(*, reset: bool = False) -> TelephonyEdge:
    global _edge
    if reset:
        _edge = None
    if _edge is not None:
        return _edge
    selected = settings.telephony_edge.strip().lower()
    if selected != "pjsip":
        raise ValueError("unsupported telephony edge; set TELEPHONY_EDGE=pjsip")
    _edge = PjsipEdge()
    return _edge


__all__ = [
    "OriginateParams",
    "PjsipEdge",
    "SupervisorParams",
    "TelephonyEdge",
    "get_edge",
]
