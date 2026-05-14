/**
 * Tiny, dependency-free CSV parser tuned for contact imports.
 * Handles commas/newlines inside quoted fields and escaped quotes (`""`).
 */

export interface ParsedContact {
  e164: string
  name?: string
  locale?: 'bn' | 'en' | 'mixed'
  attrs?: Record<string, string>
  tags?: string[]
}

export function parseCsv(text: string): string[][] {
  const rows: string[][] = []
  let row: string[] = []
  let cur = ''
  let inQuotes = false
  for (let i = 0; i < text.length; i++) {
    const c = text[i]
    if (inQuotes) {
      if (c === '"') {
        if (text[i + 1] === '"') {
          cur += '"'
          i++
        } else {
          inQuotes = false
        }
      } else {
        cur += c
      }
      continue
    }
    if (c === '"') {
      inQuotes = true
    } else if (c === ',') {
      row.push(cur)
      cur = ''
    } else if (c === '\n' || c === '\r') {
      if (c === '\r' && text[i + 1] === '\n') i++
      row.push(cur)
      rows.push(row)
      row = []
      cur = ''
    } else {
      cur += c
    }
  }
  if (cur.length > 0 || row.length > 0) {
    row.push(cur)
    rows.push(row)
  }
  return rows.filter((r) => r.some((v) => v.trim() !== ''))
}

function normalizeE164(raw: string): string | null {
  let s = raw.trim().replace(/[\s\-().]/g, '')
  if (!s) return null
  if (s.startsWith('00')) s = '+' + s.slice(2)
  if (/^\d+$/.test(s)) {
    // Bare digits — assume BD default (+880) if it starts with 0 or 1
    if (s.length === 11 && s.startsWith('01')) s = '+88' + s
    else s = '+' + s
  }
  if (!/^\+\d{8,15}$/.test(s)) return null
  return s
}

/**
 * Parses a CSV of contacts. Supports columns (case-insensitive):
 *   - phone | e164 | number | msisdn  (required)
 *   - name
 *   - locale  (bn/en/mixed; default: mixed)
 *   - tags    (comma- or pipe-separated; pipe-separated if quoted)
 *   - any other column becomes attrs[<col>]
 *
 * If no header row is detected, each row's first column is treated as phone.
 */
export function parseContactsCsv(text: string): ParsedContact[] {
  const rows = parseCsv(text)
  if (rows.length === 0) return []

  const header = rows[0].map((h) => h.trim().toLowerCase())
  const hasHeader = header.some((h) =>
    ['phone', 'e164', 'number', 'msisdn'].includes(h),
  )

  const out: ParsedContact[] = []
  const start = hasHeader ? 1 : 0
  const phoneIdx = hasHeader
    ? header.findIndex((h) => ['phone', 'e164', 'number', 'msisdn'].includes(h))
    : 0
  const nameIdx = hasHeader ? header.indexOf('name') : -1
  const localeIdx = hasHeader ? header.indexOf('locale') : -1
  const tagsIdx = hasHeader ? header.indexOf('tags') : -1

  for (let i = start; i < rows.length; i++) {
    const r = rows[i]
    const raw = r[phoneIdx]
    if (!raw) continue
    const e164 = normalizeE164(raw)
    if (!e164) continue
    const contact: ParsedContact = { e164 }
    if (nameIdx >= 0 && r[nameIdx]) contact.name = r[nameIdx].trim().slice(0, 120)
    if (localeIdx >= 0 && r[localeIdx]) {
      const l = r[localeIdx].trim().toLowerCase()
      if (l === 'bn' || l === 'en' || l === 'mixed') contact.locale = l
    }
    if (tagsIdx >= 0 && r[tagsIdx]) {
      contact.tags = r[tagsIdx]
        .split(/[|,]/)
        .map((t) => t.trim())
        .filter(Boolean)
        .slice(0, 20)
    }
    if (hasHeader) {
      const attrs: Record<string, string> = {}
      for (let j = 0; j < header.length; j++) {
        if ([phoneIdx, nameIdx, localeIdx, tagsIdx].includes(j)) continue
        const k = header[j]
        const v = r[j]
        if (k && v && v.trim()) attrs[k] = v.trim().slice(0, 500)
      }
      if (Object.keys(attrs).length > 0) contact.attrs = attrs
    }
    out.push(contact)
    if (out.length >= 10_000) break
  }
  return out
}
