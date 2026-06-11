# SIP trunk templates

Users add their own provider from the dashboard by entering:

- E.164 number / DID
- provider name
- username
- password
- SIP server IP or domain
- optional proxy, realm, transport, registration flag, and codecs

The dashboard stores the provider on the `PhoneNumber` row and renders gateway XML
for FreeSWITCH via `/api/numbers/freeswitch`.

## Render

```bash
python infra/freeswitch/scripts/render_trunks.py \
  --template infra/sip-trunks/_template.xml.j2 \
  --url https://app.example.com/api/numbers/freeswitch \
  --token "$FREESWITCH_CONFIG_TOKEN" \
  --org-id "$LIVOCALL_ORG_ID" \
  --out infra/freeswitch/sip_profiles/external
```

The legacy YAML example files remain as local development samples only.

## DID format

All BD DIDs normalise to E.164. Mobile examples look like `+8801XXXXXXXXX`; IPT/096 examples look like `+8809XXXXXXXXX`.
The dashboard and voice service also accept local BD input such as `01XXXXXXXXX` or `096XXXXXXXX` and convert it before storage/lookup.

## Codec strategy

Default to `PCMU@20i` for low latency. Gemini Live still requires PCM at the API
boundary, so keep PCMU on SIP/RTP and do exactly one local PCMU↔PCM conversion.
