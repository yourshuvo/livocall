'use client'

import { useEffect, useRef, useState } from 'react'
import type { PipecatClient } from '@pipecat-ai/client-js'
import { Button } from '@/components/ui/button'
import { Icon } from '@/components/ui/icon'
import { cn } from '@/lib/cn'

type WebcallStatus = 'idle' | 'connecting' | 'live' | 'limited'

interface PublicWebcallStartResult {
  callId: string
  transport: 'small-webrtc'
  webrtcUrl: string
  iceServers?: RTCIceServer[]
  maxDurationSec: number
  expiresAt: string
}

interface PublicWebcallSession {
  pipecat?: PipecatClient
  remoteStream?: MediaStream
  remoteAudio?: HTMLAudioElement
  limitTimer?: number
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

  useEffect(() => {
    return () => {
      closePublicWebcallSession(sessionRef.current)
      sessionRef.current = null
    }
  }, [])

  async function startWebcall() {
    if (status === 'live') {
      stopWebcall('Webcall stopped.')
      return
    }
    if (!configured || status === 'connecting' || status === 'limited') return
    if (typeof navigator === 'undefined' || !navigator.mediaDevices?.getUserMedia) {
      setError('This browser cannot start a Webcall.')
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
        callbacks: {
          onError: () => failWebcall('Webcall disconnected.'),
          onDeviceError: () => failWebcall('Microphone permission is needed for Webcall.'),
          onDisconnected: () => stopWebcall(),
          onBotDisconnected: () => stopWebcall(),
          onTrackStarted: (track) => {
            if (isLocalPipecatAudioTrack(client, track)) return
            attachPublicWebcallAudioTrack(nextSession, track)
          },
          onTrackStopped: (track) => {
            if (isLocalPipecatAudioTrack(client, track)) return
            if (track.kind === 'audio') detachPublicWebcallAudio(nextSession)
          },
          onTransportStateChanged: (state) => {
            if (state === 'error') failWebcall('Webcall connection failed.')
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
      setStatus('live')
      nextSession.limitTimer = window.setTimeout(() => {
        stopWebcall('This demo reached its time limit.')
      }, Math.max(1, start.maxDurationSec) * 1000)
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
    ? 'Webcall unavailable'
    : status === 'live'
      ? 'Stop Webcall'
      : status === 'connecting'
        ? 'Connecting'
        : 'Start Webcall'
  const statusLabel = !configured
    ? 'Unavailable'
    : status === 'live'
      ? 'Live'
      : status === 'connecting'
        ? 'Connecting'
        : status === 'limited'
          ? 'Limit reached'
          : 'Ready'
  const liveInputLabel = 'Gemini VAD is listening — speak naturally.'

  return (
    <section id="pricing" className="border-b border-line bg-white">
      <div className="mx-auto max-w-screen-xl px-6 py-20 md:py-28">
        <h2 className="landing-reveal mx-auto max-w-2xl text-center font-serif text-[60px] font-normal leading-[0.9] tracking-tight text-fg md:text-[112px]">
          Try Our<br />Webcall
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
                  className="mockup-glow-row rounded-[6px] border border-[#D2D4D6] bg-[#F5F5F7] px-3 py-2 text-fg"
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
            <h3 className="mt-5 max-w-lg font-display text-[28px] font-medium leading-[1.05] tracking-tight text-[#001238] md:text-[36px]">
              Start a Bangla Webcall with our Gemini 3.1 Flash Live agent.
            </h3>
            <DemoFact label="Language" value="Bangla only" />
            <DemoFact label="Model" value="Gemini 3.1 Flash Live" />
            <DemoFact label="Limit" value="Short public demo with credit guardrails" />
            {(!configured || error) && (
              <p className="mt-6 rounded-[6px] border border-[#D2D4D6] bg-white/70 px-3 py-2 text-[13px] text-[#334155]">
                {configured ? error : 'Public Webcall is not configured yet.'}
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
        : 'Could not start Webcall.'
    const err = new Error(message) as Error & { limited?: boolean }
    err.limited = res.status === 429
    throw err
  }
  return data as PublicWebcallStartResult
}

function closePublicWebcallSession(session: PublicWebcallSession | null, disconnectClient = true) {
  if (!session) return
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
}

function attachPublicWebcallAudioTrack(session: PublicWebcallSession, track: MediaStreamTrack) {
  if (track.kind !== 'audio') return
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
  void audio.play().catch(() => {})
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

function isLocalPipecatAudioTrack(client: PipecatClient, track: MediaStreamTrack) {
  if (track.kind !== 'audio') return false
  try {
    return client.tracks().local.audio?.id === track.id
  } catch {
    return false
  }
}
