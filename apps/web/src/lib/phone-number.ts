export function normalizeBdPhoneToE164(value: string): string {
  const trimmed = value.trim()
  if (!trimmed) return ''

  const digits = trimmed.replace(/\D/g, '')
  if (!digits) return ''

  // Already international. Treat accidental +096... / +01... entries as BD
  // national numbers because dashboard users often paste local IPT/mobile IDs
  // with a leading plus.
  if (trimmed.startsWith('+')) {
    if (digits.startsWith('880')) return `+${digits}`
    if (digits.startsWith('0')) return `+880${digits.slice(1)}`
    return `+${digits}`
  }

  if (digits.startsWith('00880')) return `+${digits.slice(2)}`
  if (digits.startsWith('00')) return `+${digits.slice(2)}`
  if (digits.startsWith('880')) return `+${digits}`
  if (digits.startsWith('0')) return `+880${digits.slice(1)}`

  // Some SIP providers present BD called/caller IDs without either +880 or
  // the national trunk prefix 0, e.g. 9639148184 for 09639148184.
  if (digits.length === 10 && /^[19]/.test(digits)) return `+880${digits}`

  return `+${digits}`
}

export function isE164(value: string): boolean {
  return /^\+\d{8,15}$/.test(value)
}
