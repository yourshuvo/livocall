// All money is stored as integer paisa (BDT × 100)
export function paisaToBdt(paisa: number): string {
  const bdt = paisa / 100
  return bdt.toLocaleString('en-BD', { minimumFractionDigits: 2, maximumFractionDigits: 2 })
}

export function fmtBdt(paisa: number): string {
  return `৳${paisaToBdt(paisa)}`
}

export function fmtDuration(seconds: number): string {
  const m = Math.floor(seconds / 60)
  const s = Math.floor(seconds % 60)
  return `${m}:${s.toString().padStart(2, '0')}`
}

export function fmtDate(d: Date | string): string {
  const date = typeof d === 'string' ? new Date(d) : d
  return date.toLocaleString('en-BD', {
    dateStyle: 'medium',
    timeStyle: 'short',
  })
}

export function fmtPhoneE164(e164: string): string {
  // +8801XXXXXXXXX → +880 1X XX XX XX XX
  if (!e164.startsWith('+880') || e164.length !== 14) return e164
  return `+880 ${e164.slice(4, 6)} ${e164.slice(6, 9)} ${e164.slice(9, 12)} ${e164.slice(12)}`
}

export function isBrowserTestCall(metadata: unknown): boolean {
  return Boolean(browserTestCallLabel(metadata))
}

export function browserTestCallLabel(metadata: unknown): string {
  if (typeof metadata !== 'object' || metadata === null) return ''
  const source = String((metadata as Record<string, unknown>).source || '')
  if (source === 'dashboard-browser-test') return 'Browser test'
  if (source === 'landing-webcall') return 'Webcall demo'
  return ''
}

export function isNonBillableTestCall(metadata: unknown): boolean {
  return (
    typeof metadata === 'object' &&
    metadata !== null &&
    ['dashboard-browser-test', 'landing-webcall'].includes(
      String((metadata as Record<string, unknown>).source || ''),
    )
  )
}
