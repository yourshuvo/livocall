#!/usr/bin/env python3
from __future__ import annotations

import json
import os
import sys
import urllib.error
import urllib.request


def main() -> int:
    voice_url = os.environ.get("VOICE_SERVICE_URL", "http://127.0.0.1:8084").rstrip("/")
    token = os.environ.get("VOICE_SERVICE_TOKEN") or os.environ.get("INBOUND_ROUTE_TOKEN", "")
    payload = {
        "destination_number": os.environ.get("destination_number", ""),
        "caller_number": os.environ.get("caller_id_number", ""),
        "fs_uuid": os.environ.get("uuid", ""),
    }
    req = urllib.request.Request(
        f"{voice_url}/calls/inbound-route",
        data=json.dumps(payload).encode("utf-8"),
        headers={
            "content-type": "application/json",
            "authorization": f"Bearer {token}",
        },
        method="POST",
    )
    try:
        with urllib.request.urlopen(req, timeout=3) as response:
            route = json.loads(response.read().decode("utf-8"))
    except (urllib.error.URLError, TimeoutError, json.JSONDecodeError) as exc:
        print(f"set livocall_route_error={str(exc)[:160]}")
        print("hangup CALL_REJECTED")
        return 0

    print(f"set call_doc_id={route['callId']}")
    print(f"set livocall_ws_url={route['wsUrl']}")
    print(f"set livocall_disclosure_url={route.get('disclosureUrl', '')}")
    print(f"set livocall_record={route.get('recordMode', 'on')}")
    print(f"set livocall_consent_prompt={route.get('consentPromptUrl', '')}")
    print(f"set agent_id={route['agentId']}")
    print(f"set tier={route['tier']}")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
