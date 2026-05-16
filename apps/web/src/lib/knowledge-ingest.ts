import { getObjectBuffer } from '@/lib/object-storage'

export type KnowledgeSourceType = 'url' | 'pdf' | 'docx' | 'text' | 'website'

export interface ExtractionResult {
  status: 'ready' | 'failed'
  text: string
  title?: string
  chunkCount: number
  error?: string
}

function chunks(text: string): number {
  return Math.max(1, Math.ceil(text.length / 1200))
}

function normalize(text: string): string {
  return text.replace(/\s+/g, ' ').trim()
}

async function extractWebsite(ref: string): Promise<ExtractionResult> {
  const controller = new AbortController()
  const timeout = setTimeout(() => controller.abort(), 12_000)
  try {
    const res = await fetch(ref, {
      signal: controller.signal,
      headers: { 'user-agent': 'LivoCall-KB-Ingest/1.0' },
    })
    if (!res.ok) throw new Error(`website fetch failed (${res.status})`)
    const html = await res.text()
    const cheerio = await import('cheerio')
    const $ = cheerio.load(html)
    $('script,style,noscript,svg,iframe,nav,footer,header').remove()
    const title = normalize($('title').first().text())
    const text = normalize($('main').text() || $('article').text() || $('body').text())
    if (!text) throw new Error('no readable website text found')
    return { status: 'ready', title, text, chunkCount: chunks(text) }
  } catch (e) {
    return { status: 'failed', text: '', chunkCount: 0, error: (e as Error).message }
  } finally {
    clearTimeout(timeout)
  }
}

async function extractFile(type: KnowledgeSourceType, ref: string): Promise<ExtractionResult> {
  try {
    const buf = await getObjectBuffer(ref)
    let text = ''
    if (type === 'docx') {
      const mammoth = (await import('mammoth')).default
      const result = await mammoth.extractRawText({ buffer: buf })
      text = result.value
    } else if (type === 'pdf') {
      text = `PDF queued for worker extraction. Stored object: ${ref}`
    } else {
      text = buf.toString('utf8')
    }
    text = normalize(text)
    if (!text) throw new Error('no readable text found')
    return { status: 'ready', text, chunkCount: chunks(text) }
  } catch (e) {
    return { status: 'failed', text: '', chunkCount: 0, error: (e as Error).message }
  }
}

export async function extractKnowledgeSource(
  type: KnowledgeSourceType,
  ref: string,
): Promise<ExtractionResult> {
  if (type === 'url' || type === 'website') return extractWebsite(ref)
  return extractFile(type, ref)
}
