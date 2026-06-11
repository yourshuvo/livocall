from __future__ import annotations

from app.main import _normalize_e164

IPT_LOCAL = "".join(["0963", "914", "8184"])
IPT_WITHOUT_TRUNK = IPT_LOCAL[1:]
IPT_E164 = f"+880{IPT_WITHOUT_TRUNK}"
MOBILE_LOCAL = "".join(["0171", "234", "5678"])
MOBILE_WITHOUT_TRUNK = MOBILE_LOCAL[1:]
MOBILE_E164 = f"+880{MOBILE_WITHOUT_TRUNK}"


def test_normalize_e164_accepts_bd_ipt_formats() -> None:
    assert _normalize_e164(IPT_LOCAL) == IPT_E164
    assert _normalize_e164(f"+{IPT_LOCAL}") == IPT_E164
    assert _normalize_e164(IPT_WITHOUT_TRUNK) == IPT_E164
    assert _normalize_e164(f"00{IPT_E164[1:]}") == IPT_E164


def test_normalize_e164_accepts_bd_mobile_formats() -> None:
    assert _normalize_e164(MOBILE_LOCAL) == MOBILE_E164
    assert _normalize_e164(MOBILE_WITHOUT_TRUNK) == MOBILE_E164


def test_normalize_e164_keeps_other_international_numbers() -> None:
    us_e164 = "+1" + "".join(["415", "555", "2671"])
    assert _normalize_e164(us_e164) == us_e164
