# Voice latency plan for Bangladesh

## What was slowing the call path

The original scaffold treated the low-cost path as `Deepgram → Gemini Flash → Cartesia`. That is three separate realtime services, so every user turn pays network latency plus STT endpointing plus LLM first-token time plus TTS first-audio time. For Bangladeshi labour-cost targets this may be cheaper per minute, but it will not feel as conversational as native audio-to-audio Gemini Live.

## Sub-500 ms production path

Use `gemini_live` with `GEMINI_LIVE_MODEL=models/gemini-3.1-flash-live-preview`.
The hard target is possible only if the SIP media path is local and the Gemini
Live WebSocket is already warm by the time the human starts speaking.

This keeps each turn on one stateful Gemini Live WebSocket:

1. BD SIP trunk RTP
2. BD-local FreeSWITCH
3. BD-local voice service
4. Gemini Live WebSocket
5. Audio streamed back to FreeSWITCH

Do not route media through the Next.js app, Vercel, or any EU/US worker.

## Required deployment topology

- Put FreeSWITCH and `services/voice` on the same Bangladesh server or private network.
- Prefer a SIP provider that can hand off RTP locally in Bangladesh.
- Keep Mongo/Redis close, but they are less important than the media path.
- If Google has no BD Live API edge for your account, use Singapore as the closest fallback voice node. Avoid Europe for voice media.
- Keep PCMU/G.711 µ-law on the SIP side with 20 ms packets.
- Do not use Opus, PCMA, or recording/transcoding filters in the hot bridge.

## PCMU constraint

Gemini Live does not accept PCMU directly. Its audio spec is raw 16-bit PCM,
16 kHz input and 24 kHz output. Therefore "PCMU end-to-end" can only mean:

```text
BD telco PCMU@20ms ↔ FreeSWITCH PCMU@20ms ↔ voice bridge PCM@16k ↔ Gemini Live
```

The production rule is: keep PCMU on every SIP/RTP leg and allow exactly one
µ-law ↔ linear PCM conversion at the Gemini bridge. Avoid every other
transcode. That conversion is cheap; extra codec hops are not.

## Tunables now in `.env`

```bash
GEMINI_LIVE_MODEL=models/gemini-3.1-flash-live-preview
GEMINI_LIVE_LANGUAGE=bn-BD
GEMINI_LIVE_VAD_SILENCE_MS=280
GEMINI_LIVE_VAD_PREFIX_PADDING_MS=120
GEMINI_LIVE_MAX_TOKENS=512
GEMINI_PRECONNECT_ENABLED=true
GEMINI_PRECONNECT_TTL_SECONDS=75
FS_PREFERRED_CODEC=PCMU
FS_CODEC_MS=20
AUDIO_FORK_BUFFER_MS=20
AUDIO_FORK_JITTER_BUFFER_MS=20
```

If callers are being cut off, raise `GEMINI_LIVE_VAD_SILENCE_MS` to `450`.
If response starts feel slow and background noise is low, lower it to `250`.
If audio stutters, raise `AUDIO_FORK_JITTER_BUFFER_MS` to `40`.

## Implemented low-latency bridge

The service now exposes `/ws/audio-pcmu` for the Gemini Live sub-500 ms path.
When `LOW_LATENCY_PCMU_BRIDGE_ENABLED=true`, outbound Gemini Live calls rewrite
the FreeSWITCH WebSocket target from `/ws/audio` to `/ws/audio-pcmu`.

That bridge:

1. accepts 8 kHz PCMU frames from FreeSWITCH,
2. splits input into 20 ms chunks,
3. decodes PCMU → PCM16 and resamples 8 kHz → 16 kHz,
4. sends 20 ms PCM chunks to Gemini Live,
5. receives 24 kHz PCM audio from Gemini,
6. chunks to 20 ms, resamples 24 kHz → 8 kHz, encodes PCMU,
7. writes PCMU bytes back to FreeSWITCH immediately,
8. drops pending model audio on caller barge-in.

Set `LOW_LATENCY_PCMU_BRIDGE_STRICT=true` in production so a Gemini bridge error
closes the call instead of falling back to echo audio.

## Preconnect during ringing

For outbound calls, the voice service now prepares the Gemini Live context as
soon as the call record is created, before `bgapi originate` is sent to
FreeSWITCH. The warm session expires after `GEMINI_PRECONNECT_TTL_SECONDS`.

Production implementation should go one step further and open the actual Gemini
Live WebSocket before answer, feeding it silence until `audio_fork` attaches.
This hides DNS, TLS, WebSocket setup, model routing, and system-instruction
upload behind the ringing time.

## 20 ms chunking

Use 20 ms packets everywhere:

- PCMU RTP packet: 160 bytes at 8 kHz.
- Gemini PCM input frame: 640 bytes at 16 kHz, mono, 16-bit.
- Do not batch multiple frames before sending to Gemini.
- Flush each Gemini audio chunk back to FreeSWITCH immediately.

If implementation code receives larger frames from `mod_audio_fork`, split them
into 20 ms PCM chunks before forwarding to Gemini.

## Sub-500 ms budget

| Segment | Target |
|---|---:|
| Caller last RTP packet → voice service receives frame | < 30 ms |
| Voice bridge forwards final 20 ms PCM chunk to Gemini | < 10 ms |
| Gemini VAD end-of-turn | 250–280 ms |
| Gemini first audio after VAD | < 180 ms |
| Voice service sends first audio to FreeSWITCH | < 10 ms |
| Total perceived turn latency | 450–500 ms |

If Gemini first audio alone is above 250 ms from Bangladesh, sub-500 ms cannot
be guaranteed from that region. Move the voice node closer to the Google Live
API edge that your account is routed to, while keeping SIP RTP local through a
BD media relay.

## Tier 2 fallback

Tier 2 now uses `DEEPGRAM_MODEL=nova-3` and `PIPELINE_LLM_MODEL=gemini-3.1-flash`, with interim STT enabled and 250 ms endpointing. It should be used only where cost is more important than interruption quality, because it cannot match native audio-to-audio latency.
