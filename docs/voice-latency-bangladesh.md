# Voice Latency Plan For Bangladesh

## Sub-500 ms Production Path

Use `gemini_live` with `GEMINI_LIVE_MODEL=models/gemini-3.1-flash-live-preview`.
The hard target depends on keeping SIP/RTP local and prewarming Gemini Live
during outbound ringing.

```txt
BD SIP trunk RTP -> embedded PJSIP edge -> voice media bridge -> Gemini Live
Gemini Live -> voice media bridge -> embedded PJSIP edge -> BD SIP trunk RTP
```

Do not route media through the Next.js app, Vercel, or a remote worker.

## Required Topology

- Run `services/voice` on a Bangladesh server or the closest available region
  with stable private/local peering to your SIP provider.
- Prefer a SIP provider that can hand off RTP locally in Bangladesh.
- Keep Mongo/Redis close, but media placement matters more.
- Use Singapore as the first fallback voice region if Google Live has no BD edge
  for your account.
- Keep G.711 PCMU/PCMA on the carrier side and use 20 ms packets.

## Codec Contract

Gemini Live does not accept carrier G.711 directly. The PJSIP media adapter is
the single conversion point:

```txt
carrier G.711 RTP <-> PJSIP media adapter <-> PCM16 internal audio <-> Gemini Live
```

Avoid every other codec hop.

## Tunables

```env
GEMINI_LIVE_MODEL=models/gemini-3.1-flash-live-preview
GEMINI_LIVE_LANGUAGE=bn-BD
GEMINI_LIVE_VAD_SILENCE_MS=280
GEMINI_LIVE_VAD_PREFIX_PADDING_MS=120
GEMINI_PRECONNECT_ENABLED=true
GEMINI_PRECONNECT_TTL_SECONDS=75
PJSIP_CODECS=PCMU/8000,PCMA/8000
PJSIP_FRAME_MS=20
SAMPLE_RATE_IN=16000
```

If callers are being cut off, raise `GEMINI_LIVE_VAD_SILENCE_MS` to `450`.
If response starts feel slow and background noise is low, lower it to `250`.

## 20 ms Chunking

- PCMU RTP packet: 160 bytes at 8 kHz.
- Internal PCM input frame: 640 bytes at 16 kHz, mono, 16-bit.
- Do not batch multiple frames before sending to Gemini.
- Flush each Gemini audio chunk back to the PJSIP media bridge immediately.

## Budget

| Segment | Target |
|---|---:|
| Caller last RTP packet -> voice service receives frame | < 30 ms |
| Voice bridge forwards final 20 ms PCM chunk to Gemini | < 10 ms |
| Gemini VAD end-of-turn | 250-280 ms |
| Gemini first audio after VAD | < 180 ms |
| Voice service sends first audio to PJSIP media bridge | < 10 ms |
| Total perceived turn latency | 450-500 ms |

If Gemini first audio alone is above 250 ms from Bangladesh, sub-500 ms cannot
be guaranteed from that region.
