from __future__ import annotations

CLIP = 32635
BIAS = 0x84


def split_pcmu_20ms(audio: bytes) -> list[bytes]:
    return _split_frames(audio, 160)


def split_pcm16_16k_20ms(audio: bytes) -> list[bytes]:
    return _split_frames(audio, 640)


def split_pcm16_24k_20ms(audio: bytes) -> list[bytes]:
    return _split_frames(audio, 960)


def pcmu_to_pcm16_16k(audio: bytes) -> bytes:
    out = bytearray()
    for byte in audio:
        sample = _ulaw_to_linear(byte)
        packed = int(sample).to_bytes(2, "little", signed=True)
        out.extend(packed)
        out.extend(packed)
    return bytes(out)


def pcm16_24k_to_pcmu(audio: bytes) -> bytes:
    out = bytearray()
    for i in range(0, len(audio) - 5, 6):
        sample = int.from_bytes(audio[i : i + 2], "little", signed=True)
        out.append(_linear_to_ulaw(sample))
    return bytes(out)


def resample_pcm16_mono(audio: bytes, src_rate: int, dst_rate: int) -> bytes:
    if not audio or src_rate <= 0 or dst_rate <= 0 or src_rate == dst_rate:
        return audio
    if len(audio) % 2:
        audio += b"\x00"
    try:
        import audioop

        converted, _state = audioop.ratecv(audio, 2, 1, src_rate, dst_rate, None)
        return converted
    except Exception:  # pragma: no cover - audioop exists on Python 3.11
        return _resample_pcm16_linear(audio, src_rate, dst_rate)


def _resample_pcm16_linear(audio: bytes, src_rate: int, dst_rate: int) -> bytes:
    samples = [
        int.from_bytes(audio[i : i + 2], "little", signed=True) for i in range(0, len(audio) - 1, 2)
    ]
    if not samples:
        return b""
    out_len = max(1, int(len(samples) * dst_rate / src_rate))
    if out_len == 1:
        return int(samples[0]).to_bytes(2, "little", signed=True)
    out = bytearray()
    scale = (len(samples) - 1) / (out_len - 1)
    for i in range(out_len):
        pos = i * scale
        left = int(pos)
        right = min(left + 1, len(samples) - 1)
        frac = pos - left
        sample = round(samples[left] * (1 - frac) + samples[right] * frac)
        out.extend(int(sample).to_bytes(2, "little", signed=True))
    return bytes(out)


def _split_frames(audio: bytes, frame_size: int) -> list[bytes]:
    return [frame for i in range(0, len(audio), frame_size) if (frame := audio[i : i + frame_size])]


def _linear_to_ulaw(sample: int) -> int:
    sign = 0x80 if sample < 0 else 0
    if sample < 0:
        sample = -sample
    sample = min(sample, CLIP) + BIAS

    exponent = 7
    mask = 0x4000
    while exponent > 0 and not (sample & mask):
        mask >>= 1
        exponent -= 1
    mantissa = (sample >> (exponent + 3)) & 0x0F
    return (~(sign | (exponent << 4) | mantissa)) & 0xFF


def _ulaw_to_linear(byte: int) -> int:
    byte = (~byte) & 0xFF
    sign = byte & 0x80
    exponent = (byte >> 4) & 0x07
    mantissa = byte & 0x0F
    sample = ((mantissa << 3) + BIAS) << exponent
    sample -= BIAS
    return -sample if sign else sample
