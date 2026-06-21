from __future__ import annotations

import base64
import hashlib
import os

import structlog

log = structlog.get_logger()


def _encryption_key() -> bytes:
    source = (
        os.environ.get("SIP_CREDENTIAL_SECRET")
        or os.environ.get("SESSION_SECRET")
        or "livocall-dev"
    )
    return hashlib.sha256(source.encode("utf-8")).digest()


def decrypt_sip_password(value: str) -> str:
    """Decrypt web-stored SIP passwords.

    Mirrors apps/web/src/lib/sip.ts. Plaintext values are returned unchanged so
    older rows and IP-auth trunks continue to work.
    """
    if not value:
        return ""
    parts = value.split(":")
    if len(parts) != 4 or parts[0] != "v1":
        return value

    try:
        from cryptography.hazmat.primitives.ciphers.aead import AESGCM
    except ImportError:
        log.warning(
            "sip_credentials.cryptography_missing",
            hint="install cryptography or provide plaintext SIP credentials",
        )
        return ""

    try:
        _version, iv_b64, tag_b64, ciphertext_b64 = parts
        iv = base64.b64decode(iv_b64)
        tag = base64.b64decode(tag_b64)
        ciphertext = base64.b64decode(ciphertext_b64)
        plaintext = AESGCM(_encryption_key()).decrypt(iv, ciphertext + tag, None)
        return plaintext.decode("utf-8")
    except Exception as exc:  # noqa: BLE001
        log.warning("sip_credentials.decrypt_failed", error=str(exc))
        return ""
