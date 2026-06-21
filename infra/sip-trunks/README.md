# SIP Trunks

Users add provider credentials from the dashboard by entering:

- E.164 number or DID
- provider name and slug
- SIP username and password
- SIP server, optional proxy, realm, transport, registration flag, and codecs

The web app stores those values on `PhoneNumber` rows. The voice service loads
active rows directly into the embedded PJSIP edge when `PJSIP_LOAD_ACCOUNTS_FROM_DB=true`.
Dashboard/API number changes call the voice service `POST /pjsip/reload` endpoint.

## DID Format

All BD DIDs normalize to E.164. Mobile examples look like `+8801XXXXXXXXX`;
IPT/096 examples look like `+8809XXXXXXXXX`. The dashboard and voice service
also accept local BD input such as `01XXXXXXXXX` or `096XXXXXXXX`.

## Codec Strategy

Default to `PCMU/8000,PCMA/8000` for carrier interoperability. The PJSIP media
adapter converts to the internal PCM sample rate used by the AI tiers.
