from __future__ import annotations

from pydantic import Field
from pydantic_settings import BaseSettings, SettingsConfigDict


class Settings(BaseSettings):
    model_config = SettingsConfigDict(env_file=".env", env_file_encoding="utf-8", extra="ignore")

    mongodb_uri: str = Field(default="mongodb://localhost:27017/livocall")
    redis_url: str = Field(default="redis://localhost:6379/0")

    # Embedded PJSIP/pjsua2 is the only phone-call edge.
    telephony_edge: str = Field(default="pjsip")

    # Embedded PJSIP/pjsua2 account defaults. Production normally hydrates
    # dashboard-created PhoneNumber rows from Mongo.
    pjsip_sip_server: str = Field(default="")
    pjsip_sip_port: int = Field(default=5060)
    pjsip_username: str = Field(default="")
    pjsip_auth_username: str = Field(default="")
    pjsip_password: str = Field(default="")
    pjsip_realm: str = Field(default="*")
    pjsip_local_sip_port: int = Field(default=5070)
    pjsip_default_account_slug: str = Field(default="sip_custom")
    pjsip_load_accounts_from_db: bool = Field(default=False)
    pjsip_rtp_port_start: int = Field(default=20000)
    pjsip_rtp_port_range: int = Field(default=10000)
    pjsip_public_address: str = Field(default="")
    pjsip_bound_address: str = Field(default="")
    pjsip_transport: str = Field(default="udp")
    pjsip_codecs: str = Field(default="PCMU/8000,PCMA/8000")

    # Web app callback (event ingest + webhook tick)
    web_base_url: str = Field(default="http://localhost:3000")
    web_shared_secret: str = Field(default="")  # must match VOICE_SHARED_SECRET on the web side

    # Service-to-service auth: callers (the web app) must present this token
    voice_service_token: str = Field(default="")

    # AI providers (left blank for scaffold)
    gemini_api_key: str = Field(default="")
    deepgram_api_key: str = Field(default="")
    cartesia_api_key: str = Field(default="")
    xai_api_key: str = Field(default="")
    soniox_api_key: str = Field(default="")

    # Telephony
    default_outbound_caller_id: str = Field(default="+8809610000000")
    sip_credential_secret: str = Field(default="")

    # Audio
    sample_rate_in: int = Field(default=16000)
    sample_rate_out: int = Field(default=24000)
    pjsip_frame_ms: int = Field(default=20)
    first_turn_prompt_enabled: bool = Field(default=True)
    gemini_preconnect_enabled: bool = Field(default=True)
    gemini_preconnect_ttl_seconds: float = Field(default=75.0)
    low_latency_pcmu_bridge_enabled: bool = Field(default=True)
    low_latency_pcmu_bridge_strict: bool = Field(default=True)

    # Gemini Live
    gemini_live_model: str = Field(default="models/gemini-3.1-flash-live-preview")
    gemini_live_voice: str = Field(default="Puck")
    gemini_live_language: str = Field(default="bn")
    gemini_live_temperature: float = Field(default=0.25)
    gemini_live_max_tokens: int = Field(default=512)
    gemini_live_vad_silence_ms: int = Field(default=500)
    gemini_live_vad_prefix_padding_ms: int = Field(default=100)
    gemini_live_context_compression_enabled: bool = Field(default=True)
    gemini_kb_tool_timeout_ms: int = Field(default=1200)
    gemini_memory_enabled: bool = Field(default=True)
    gemini_memory_max_chars: int = Field(default=6000)
    gemini_kb_cache_enabled: bool = Field(default=True)

    # Grok Voice Agent
    grok_voice_model: str = Field(default="grok-voice-think-fast-1.0")
    grok_voice_voice: str = Field(default="rohan")
    grok_voice_language: str = Field(default="bn")
    grok_voice_audio_format: str = Field(default="audio/pcm")
    grok_voice_audio_rate: int = Field(default=16000)
    grok_voice_vad_threshold: float = Field(default=0.85)
    grok_voice_vad_silence_ms: int = Field(default=500)
    grok_voice_vad_prefix_padding_ms: int = Field(default=500)

    # Tier 2 fallback / Pipecat pipeline. Gemini Live intentionally does not use
    # these VAD settings because Gemini Live owns turn-taking natively.
    pipeline_llm_model: str = Field(default="gemini-2.5-flash")
    pipeline_stt_provider: str = Field(default="soniox")
    pipeline_tts_provider: str = Field(default="soniox")
    deepgram_model: str = Field(default="nova-3")  # latest Deepgram STT model
    deepgram_language: str = Field(default="bn")
    cartesia_voice_id: str = Field(default="")
    soniox_stt_model: str = Field(default="stt-rt-v4")
    soniox_stt_url: str = Field(default="wss://stt-rt.soniox.com/transcribe-websocket")
    soniox_tts_model: str = Field(default="tts-rt-v1")
    soniox_tts_url: str = Field(default="wss://tts-rt.soniox.com/tts-websocket")
    soniox_tts_voice: str = Field(default="Adrian")
    soniox_language: str = Field(default="bn")
    pipecat_vad_confidence: float = Field(default=0.7)
    pipecat_vad_start_secs: float = Field(default=0.2)
    pipecat_vad_stop_secs: float = Field(default=0.2)
    pipecat_vad_audio_idle_timeout_secs: float = Field(default=0.35)
    pipecat_vad_min_volume: float = Field(default=0.6)

    # Shared secret used to HMAC direct /ws/audio browser-test sessions.
    voice_ws_shared_secret: str = Field(default="")
    voice_ws_auth_ttl_seconds: int = Field(default=3600)

    # Browser-only WebRTC transport.
    browser_webrtc_enabled: bool = Field(default=False)
    webrtc_ice_servers: str = Field(default="stun:stun.l.google.com:19302")
    webrtc_turn_url: str = Field(default="")
    webrtc_turn_username: str = Field(default="")
    webrtc_turn_credential: str = Field(default="")

    # Pricing — paisa per minute, charged at the end of the call. See ARCHITECTURE.md §7.
    rate_paisa_per_min_gemini_live: int = Field(default=700)
    rate_paisa_per_min_grok_voice: int = Field(default=700)
    rate_paisa_per_min_pipeline: int = Field(default=600)
    rate_paisa_per_min_dtmf: int = Field(default=200)

    # If True, /calls/originate will fall back to a fake-driver path (no real
    # SIP or AI calls). Useful for local dev and CI.
    voice_fake_driver: bool = Field(default=False)

    # Background workers
    enable_campaign_dialer: bool = Field(default=False)
    enable_kb_ingestor: bool = Field(default=False)
    enable_webhook_scheduler: bool = Field(default=False)
    campaign_poll_interval_seconds: float = Field(default=5.0)
    kb_poll_interval_seconds: float = Field(default=30.0)

    # Post-call persistence
    recordings_local_dir: str = Field(default="/tmp/livocall-recordings")
    s3_recordings_bucket: str = Field(default="")
    s3_region: str = Field(default="")
    s3_endpoint_url: str = Field(default="")
    s3_recordings_public_base_url: str = Field(default="")
    aws_access_key_id: str = Field(default="")
    aws_secret_access_key: str = Field(default="")
    summarizer_enabled: bool = Field(default=True)


settings = Settings()


def rate_paisa_per_min(tier: str) -> int:
    if tier == "gemini_live":
        return settings.rate_paisa_per_min_gemini_live
    if tier == "grok_voice":
        return settings.rate_paisa_per_min_grok_voice
    if tier == "pipeline":
        return settings.rate_paisa_per_min_pipeline
    if tier == "dtmf":
        return settings.rate_paisa_per_min_dtmf
    raise ValueError(f"unknown tier: {tier}")
