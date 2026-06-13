'use client'

import { useCallback, useEffect, useRef, useState } from 'react'
import type { PipecatClient } from '@pipecat-ai/client-js'
import { Button } from '@/components/ui/button'
import { Icon } from '@/components/ui/icon'
import { cn } from '@/lib/cn'
import {
  isLocalPipecatAudioTrack,
  shouldAttachRemotePipecatAudioTrack,
  shouldTearDownRemotePipecatAudioTrack,
} from '@/lib/pipecat-track-routing'
import {
  PUBLIC_WEBCALL_DISCONNECT_ON_BOT_DISCONNECT,
  shouldEndPublicWebcallOnBotDisconnect,
} from '@/lib/public-webcall-session'

type WebcallStatus = 'idle' | 'connecting' | 'live' | 'limited'

interface PublicWebcallStartResult {
  callId: string
  transport: 'small-webrtc'
  webrtcUrl: string
  iceServers?: RTCIceServer[]
  maxDurationSec: number
  expiresAt: string
  recordingUploadToken?: string
}

interface PublicWebcallSession {
  pipecat?: PipecatClient
  remoteStream?: MediaStream
  remoteAudio?: HTMLAudioElement
  limitTimer?: number
  recorder?: MediaRecorder
  recordingChunks?: Blob[]
  recordingStream?: MediaStream
  recordingAudioContext?: AudioContext
  recordingDestination?: MediaStreamAudioDestinationNode
  recordingSources?: MediaStreamAudioSourceNode[]
  recordingTrackIds?: Set<string>
  localRecordTrack?: MediaStreamTrack
  remoteRecordTrack?: MediaStreamTrack
  recordingCallId?: string
  recordingUploadToken?: string
  recordingUploadStarted?: boolean
}

export function PublicWebcallDemo({
  tags,
  configured,
}: {
  tags: readonly string[]
  configured: boolean
}) {
  const [status, setStatus] = useState<WebcallStatus>('idle')
  const [error, setError] = useState('')
  const sessionRef = useRef<PublicWebcallSession | null>(null)
  const prewarmStartedRef = useRef(false)

  const prewarmWebcall = useCallback(() => {
    if (!configured || prewarmStartedRef.current) return
    prewarmStartedRef.current = true
    void fetch('/api/voice/browser-prewarm', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: '{}',
    }).catch(() => {
      // Best-effort only. The actual Webcall start path still creates the
      // real Gemini/WebRTC session if prewarm fails or times out.
    })
  }, [configured])

  useEffect(() => {
    if (configured) prewarmWebcall()
    return () => {
      closePublicWebcallSession(sessionRef.current)
      sessionRef.current = null
    }
  }, [configured, prewarmWebcall])

  async function startWebcall() {
    prewarmWebcall()
    if (status === 'live') {
      stopWebcall('Demo call stopped.')
      return
    }
    if (!configured || status === 'connecting' || status === 'limited') return
    if (typeof navigator === 'undefined' || !navigator.mediaDevices?.getUserMedia) {
      setError('This browser cannot start the demo call.')
      return
    }

    setError('')
    setStatus('connecting')
    const nextSession: PublicWebcallSession = {}

    try {
      const start = await startPublicWebcall()
      const [{ PipecatClient }, { SmallWebRTCTransport }] = await Promise.all([
        import('@pipecat-ai/client-js'),
        import('@pipecat-ai/small-webrtc-transport'),
      ])
      const client = new PipecatClient({
        transport: new SmallWebRTCTransport({
          iceServers: start.iceServers ?? [],
          waitForICEGathering: false,
        }),
        enableMic: true,
        enableCam: false,
        disconnectOnBotDisconnect: PUBLIC_WEBCALL_DISCONNECT_ON_BOT_DISCONNECT,
        callbacks: {
          onError: () => failWebcall('Demo call disconnected.'),
          onDeviceError: () => failWebcall('Microphone permission is needed for the demo call.'),
          onDisconnected: () => stopWebcall(),
          onBotDisconnected: () => {
            if (shouldEndPublicWebcallOnBotDisconnect()) stopWebcall()
          },
          onTrackStarted: (track, participant) => {
            const localAudioTrack = currentLocalPipecatAudioTrack(client)
            if (isLocalPipecatAudioTrack(track, participant, localAudioTrack)) {
              if (track.kind === 'audio') {
                nextSession.localRecordTrack = track
                addPublicWebcallRecordingTrack(nextSession, track)
                maybeStartPublicWebcallRecording(
                  nextSession,
                  start.callId,
                  start.recordingUploadToken,
                )
              }
              return
            }
            if (!shouldAttachRemotePipecatAudioTrack(track, participant, localAudioTrack)) return
            attachPublicWebcallAudioTrack(
              nextSession,
              track,
              start.callId,
              start.recordingUploadToken,
            )
          },
          onTrackStopped: (track, participant) => {
            if (
              !shouldTearDownRemotePipecatAudioTrack(
                track,
                participant,
                currentLocalPipecatAudioTrack(client),
              )
            ) {
              return
            }
            detachPublicWebcallAudio(nextSession)
          },
          onTransportStateChanged: (state) => {
            if (state === 'error') failWebcall('Demo call connection failed.')
          },
        },
      })
      nextSession.pipecat = client
      sessionRef.current = nextSession
      await client.initDevices()
      await client.connect({
        webrtcRequestParams: { endpoint: start.webrtcUrl },
        iceConfig: { iceServers: start.iceServers ?? [] },
      })
      const localAudioTrack = client.tracks().local.audio
      if (localAudioTrack) {
        nextSession.localRecordTrack = localAudioTrack
        addPublicWebcallRecordingTrack(nextSession, localAudioTrack)
        maybeStartPublicWebcallRecording(nextSession, start.callId, start.recordingUploadToken)
      }
      setStatus('live')
      nextSession.limitTimer = window.setTimeout(
        () => {
          stopWebcall('This demo reached its time limit.')
        },
        Math.max(1, start.maxDurationSec) * 1000,
      )
    } catch (err) {
      closePublicWebcallSession(nextSession)
      if (sessionRef.current === nextSession) sessionRef.current = null
      const limited = Boolean((err as Error & { limited?: boolean }).limited)
      setStatus(limited ? 'limited' : 'idle')
      setError(err instanceof Error ? err.message : 'Could not start Webcall.')
    }
  }

  function stopWebcall(message = '') {
    closePublicWebcallSession(sessionRef.current)
    sessionRef.current = null
    setStatus('idle')
    if (message) setError(message)
  }

  function failWebcall(message: string) {
    closePublicWebcallSession(sessionRef.current, false)
    sessionRef.current = null
    setStatus('idle')
    setError(message)
  }

  const buttonLabel = !configured
    ? 'Demo unavailable'
    : status === 'live'
      ? 'Stop demo call'
      : status === 'connecting'
        ? 'Connecting'
        : 'Start demo call'
  const statusLabel = !configured
    ? 'Unavailable'
    : status === 'live'
      ? 'Live'
      : status === 'connecting'
        ? 'Connecting'
        : status === 'limited'
          ? 'Limit reached'
          : 'Ready'
  const liveInputLabel = 'Speak naturally. The agent will wait for your turn.'

  return (
    <section id="live-demo" className="border-line border-b bg-white">
      <div className="mx-auto max-w-screen-xl px-6 py-20 md:py-28">
        <h2 className="landing-reveal text-fg mx-auto max-w-2xl text-center font-serif text-[60px] font-normal leading-[0.9] tracking-tight md:text-[112px]">
          Try a Bangla
          <br />
          AI call
        </h2>

        <div className="landing-stagger mt-20 grid gap-4 lg:grid-cols-2">
          <div className="landing-motion-card rounded-[10px] border border-[#D2D4D6] bg-white p-8">
            <div className="grid min-h-[430px] place-items-center">
              <div
                className={cn(
                  'webcall-orb-shell relative grid size-64 place-items-center rounded-full',
                  status === 'connecting' && 'webcall-orb--connecting',
                  status === 'live' && 'webcall-orb--live',
                )}
              >
                <div className="live-demo-orb relative size-56 overflow-hidden rounded-full bg-[radial-gradient(circle_at_30%_20%,#7dd3fc,transparent_34%),radial-gradient(circle_at_70%_30%,#f5d0fe,transparent_32%),radial-gradient(circle_at_45%_65%,#2563eb,transparent_36%),radial-gradient(circle_at_72%_72%,#67e8f9,transparent_34%)] opacity-90" />
              </div>
            </div>
            <div className="mx-auto grid max-w-lg grid-cols-2 gap-2 text-center text-[12px] font-semibold sm:grid-cols-3">
              {tags.map((tag) => (
                <span
                  key={tag}
                  className="mockup-glow-row text-fg rounded-[6px] border border-[#D2D4D6] bg-[#F5F5F7] px-3 py-2"
                >
                  {tag}
                </span>
              ))}
            </div>
          </div>

          <div className="landing-motion-card rounded-[10px] border border-[#D2D4D6] bg-[#f1f1f7] p-8 md:p-12">
            <div className="flex items-center gap-2">
              <span
                className={cn(
                  'size-2 rounded-full',
                  status === 'live'
                    ? 'bg-emerald-500'
                    : status === 'connecting'
                      ? 'bg-blue-600'
                      : status === 'limited'
                        ? 'bg-amber-500'
                        : 'bg-[#98a2b3]',
                )}
              />
              <span className="text-[12px] font-semibold uppercase tracking-[0.12em] text-blue-600">
                {statusLabel}
              </span>
            </div>
            <h3 className="font-display mt-5 max-w-lg text-[28px] font-medium leading-[1.05] tracking-tight text-[#001238] md:text-[36px]">
              Hear how Livocall handles a real customer conversation.
            </h3>
            <DemoFact label="Language" value="Bangla-first customer experience" />
            <DemoFact label="Use case" value="Signup follow-up, support, and order confirmation" />
            <DemoFact label="Safety" value="Short public demo with credit guardrails" />
            {(!configured || error) && (
              <p className="mt-6 rounded-[6px] border border-[#D2D4D6] bg-white/70 px-3 py-2 text-[13px] text-[#334155]">
                {configured ? error : 'Public demo call is not configured yet.'}
              </p>
            )}
            {status === 'live' && (
              <p className="mt-6 min-h-9 rounded-[6px] border border-[#D2D4D6] bg-white/70 px-3 py-2 text-[13px] text-[#334155]">
                {liveInputLabel}
              </p>
            )}
            <Button
              type="button"
              size="lg"
              className="mt-12 px-6"
              disabled={!configured || status === 'connecting' || status === 'limited'}
              onPointerEnter={prewarmWebcall}
              onFocus={prewarmWebcall}
              onClick={() => void startWebcall()}
            >
              <Icon name={status === 'live' ? 'x' : 'phone'} size="xs" square={false} />
              {buttonLabel}
            </Button>
          </div>
        </div>
      </div>
    </section>
  )
}

function DemoFact({ label, value }: { label: string; value: string }) {
  return (
    <div className="mt-10 border-b border-[#c6cad0] pb-4">
      <p className="text-[12px] font-semibold text-blue-600">{label}</p>
      <div className="mt-6 text-[20px] font-medium text-[#001238]">{value}</div>
    </div>
  )
}

async function startPublicWebcall(): Promise<PublicWebcallStartResult> {
  const res = await fetch('/api/public/webcall/start', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: '{}',
  })
  const data = await res.json().catch(() => null)
  if (!res.ok) {
    const message =
      data &&
      typeof data === 'object' &&
      'error' in data &&
      data.error &&
      typeof data.error === 'object' &&
      'message' in data.error &&
      typeof data.error.message === 'string'
        ? data.error.message
        : 'Could not start the demo call.'
    const err = new Error(message) as Error & { limited?: boolean }
    err.limited = res.status === 429
    throw err
  }
  return data as PublicWebcallStartResult
}

function closePublicWebcallSession(session: PublicWebcallSession | null, disconnectClient = true) {
  if (!session) return
  stopAndUploadPublicWebcallRecording(session)
  if (session.limitTimer) window.clearTimeout(session.limitTimer)
  for (const track of session.remoteStream?.getTracks() ?? []) {
    track.stop()
  }
  if (session.remoteAudio) {
    session.remoteAudio.pause()
    session.remoteAudio.srcObject = null
    session.remoteAudio.remove()
  }
  if (disconnectClient && session.pipecat) {
    void session.pipecat.disconnect().catch(() => {})
  }
  void session.recordingAudioContext?.close().catch(() => undefined)
}

function attachPublicWebcallAudioTrack(
  session: PublicWebcallSession,
  track: MediaStreamTrack,
  callId: string,
  recordingUploadToken?: string,
) {
  if (track.kind !== 'audio') return
  session.remoteRecordTrack = track
  addPublicWebcallRecordingTrack(session, track)
  maybeStartPublicWebcallRecording(session, callId, recordingUploadToken)
  detachPublicWebcallAudio(session)

  const stream = new MediaStream([track])
  const audio = document.createElement('audio')
  audio.autoplay = true
  audio.setAttribute('playsinline', 'true')
  audio.muted = false
  audio.volume = 1
  audio.srcObject = stream
  audio.style.display = 'none'
  document.body.appendChild(audio)

  session.remoteStream = stream
  session.remoteAudio = audio
  playHiddenRemoteAudio(audio)
}

function publicWebcallRecordingMimeType(): string {
  if (typeof MediaRecorder === 'undefined') return ''
  const candidates = ['audio/webm;codecs=opus', 'audio/webm', 'audio/mp4']
  return candidates.find((type) => MediaRecorder.isTypeSupported(type)) || ''
}

function ensurePublicWebcallRecordingMixer(session: PublicWebcallSession) {
  if (session.recordingDestination) return session.recordingDestination
  if (typeof window === 'undefined' || typeof window.AudioContext === 'undefined') return null
  const context = new window.AudioContext()
  const destination = context.createMediaStreamDestination()
  session.recordingAudioContext = context
  session.recordingDestination = destination
  session.recordingStream = destination.stream
  session.recordingSources = []
  session.recordingTrackIds = new Set<string>()
  void context.resume().catch(() => undefined)
  return destination
}

function addPublicWebcallRecordingTrack(session: PublicWebcallSession, track: MediaStreamTrack) {
  if (track.kind !== 'audio') return
  const destination = ensurePublicWebcallRecordingMixer(session)
  if (!destination || !session.recordingAudioContext) return
  if (!session.recordingTrackIds) session.recordingTrackIds = new Set<string>()
  if (session.recordingTrackIds.has(track.id)) return
  const source = session.recordingAudioContext.createMediaStreamSource(new MediaStream([track]))
  source.connect(destination)
  session.recordingSources = [...(session.recordingSources ?? []), source]
  session.recordingTrackIds.add(track.id)
}

function maybeStartPublicWebcallRecording(
  session: PublicWebcallSession,
  callId: string,
  recordingUploadToken?: string,
) {
  if (!recordingUploadToken || session.recorder || typeof MediaRecorder === 'undefined') return
  const destination = ensurePublicWebcallRecordingMixer(session)
  if (!destination || !session.recordingTrackIds?.size) return

  try {
    const mimeType = publicWebcallRecordingMimeType()
    const chunks: Blob[] = []
    const recorder = new MediaRecorder(destination.stream, mimeType ? { mimeType } : undefined)
    recorder.ondataavailable = (event) => {
      if (event.data.size > 0) chunks.push(event.data)
    }
    recorder.onstop = () => {
      if (!chunks.length || session.recordingUploadStarted) return
      session.recordingUploadStarted = true
      const blob = new Blob(chunks, { type: recorder.mimeType || mimeType || 'audio/webm' })
      void uploadPublicWebcallRecording(callId, recordingUploadToken, blob)
    }
    session.recordingStream = destination.stream
    session.recordingChunks = chunks
    session.recordingCallId = callId
    session.recordingUploadToken = recordingUploadToken
    session.recorder = recorder
    recorder.start(1000)
  } catch {
    // Recording is best-effort; Webcall should still work if MediaRecorder is unavailable.
  }
}

function stopAndUploadPublicWebcallRecording(session: PublicWebcallSession) {
  const recorder = session.recorder
  if (!recorder || recorder.state === 'inactive') return
  try {
    recorder.requestData()
  } catch {}
  try {
    recorder.stop()
  } catch {}
}

async function uploadPublicWebcallRecording(callId: string, token: string, blob: Blob) {
  if (!callId || !token || blob.size === 0) return
  const form = new FormData()
  const ext = blob.type.includes('mp4') ? 'm4a' : blob.type.includes('ogg') ? 'ogg' : 'webm'
  form.append('file', blob, `public-webcall-${callId}.${ext}`)
  try {
    await fetch(`/api/public/webcall/${callId}/recording`, {
      method: 'POST',
      headers: { 'x-recording-token': token },
      body: form,
    })
  } catch {
    // The live Webcall remains usable; failed uploads simply leave no recording in Calls.
  }
}

function playHiddenRemoteAudio(audio: HTMLAudioElement) {
  void audio.play().catch(() => {
    const retry = () => {
      document.removeEventListener('pointerdown', retry)
      document.removeEventListener('touchend', retry)
      document.removeEventListener('keydown', retry)
      void audio.play().catch(() => undefined)
    }
    document.addEventListener('pointerdown', retry, { once: true })
    document.addEventListener('touchend', retry, { once: true })
    document.addEventListener('keydown', retry, { once: true })
  })
}

function detachPublicWebcallAudio(session: PublicWebcallSession) {
  for (const track of session.remoteStream?.getTracks() ?? []) {
    track.stop()
  }
  session.remoteStream = undefined
  if (session.remoteAudio) {
    session.remoteAudio.pause()
    session.remoteAudio.srcObject = null
    session.remoteAudio.remove()
  }
  session.remoteAudio = undefined
}

function currentLocalPipecatAudioTrack(client: PipecatClient) {
  try {
    return client.tracks().local.audio
  } catch {
    return undefined
  }
}
