'use client'
import { useState, useTransition } from 'react'
import { Card, CardBody, CardTitle, CardDescription } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Textarea } from '@/components/ui/textarea'
import { Badge } from '@/components/ui/badge'
import { Icon, type IconName } from '@/components/ui/icon'
import { Label } from '@/components/ui/label'
import { api } from '@/lib/api-fetch'
import { useToast } from '@/components/ui/toast'

interface Source {
  type: 'url' | 'website' | 'pdf' | 'docx' | 'text'
  ref: string
  content?: string
  title?: string
  ingestion?: {
    status?: 'queued' | 'extracting' | 'ready' | 'failed'
    chunkCount?: number
    extractedChars?: number
    error?: string
    extractedAt?: string | Date | null
  }
  addedAt?: string | Date | null
  storage?: {
    provider?: 'local' | 's3' | 'external' | 'inline'
    key?: string
  }
}

interface Quality {
  score: number
  readySources: number
  failedSources: number
  chunkCount: number
  extractedChars: number
  recommendations: string[]
  updatedAt?: string | Date | null
}

interface KB {
  id: string
  name: string
  sources: Source[]
  embeddingNamespace: string
  quality?: Quality | null
  createdAt: string | null
  updatedAt: string | null
}

const SOURCE_ICON: Record<Source['type'], IconName> = {
  url: 'globe',
  website: 'globe',
  pdf: 'book',
  docx: 'book',
  text: 'quote',
}

function calculateClientQuality(kb: KB): Quality {
  const readySources = kb.sources.filter((s) => s.ingestion?.status === 'ready').length
  const failedSources = kb.sources.filter((s) => s.ingestion?.status === 'failed').length
  const chunkCount = kb.sources.reduce((sum, s) => sum + Number(s.ingestion?.chunkCount || 0), 0)
  const extractedChars = kb.sources.reduce(
    (sum, s) => sum + Number(s.ingestion?.extractedChars || 0),
    0,
  )
  const types = new Set(kb.sources.map((s) => s.type))
  const recommendations: string[] = []
  if (kb.sources.length === 0) recommendations.push('Add an FAQ, website, PDF, or text source.')
  if (readySources === 0 && kb.sources.length > 0) recommendations.push('Fix ingestion errors before using this KB in calls.')
  if (extractedChars < 2000) recommendations.push('Add product, delivery, pricing, and policy details.')
  if (!types.has('url') && !types.has('website')) recommendations.push('Add your website or product pages.')
  if (!types.has('text')) recommendations.push('Add golden answers for common customer questions.')
  if (failedSources > 0) recommendations.push('Remove or re-add failed sources.')

  return {
    score: Math.max(
      0,
      Math.min(
        100,
        Math.min(25, readySources * 8) +
          Math.min(25, chunkCount * 2) +
          Math.min(25, Math.floor(extractedChars / 200)) +
          Math.min(15, types.size * 5) +
          (failedSources === 0 ? 10 : Math.max(0, 10 - failedSources * 4)),
      ),
    ),
    readySources,
    failedSources,
    chunkCount,
    extractedChars,
    recommendations: recommendations.slice(0, 4),
  }
}

export function KnowledgeClient({ initial }: { initial: KB[] }) {
  const [items, setItems] = useState<KB[]>(initial)
  const [creating, setCreating] = useState(false)
  const [name, setName] = useState('')
  const [namespace, setNamespace] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [pending, startTransition] = useTransition()
  const { toast } = useToast()

  async function refresh() {
    const j = await api.get<{ knowledgeBases: KB[] }>('/api/knowledge')
    setItems(j.knowledgeBases)
  }

  async function create() {
    setError(null)
    try {
      await api.post('/api/knowledge', { name, embeddingNamespace: namespace })
      setName('')
      setNamespace('')
      setCreating(false)
      toast('Knowledge base created', 'success')
      await refresh()
    } catch (e) {
      const msg = (e as Error).message
      setError(msg)
      toast(msg, 'error')
    }
  }

  function remove(id: string) {
    if (!confirm('Delete this knowledge base? Embeddings will be removed.')) return
    startTransition(async () => {
      try {
        await api.del(`/api/knowledge/${id}`)
        toast('Knowledge base deleted', 'success')
        await refresh()
      } catch (e) {
        toast((e as Error).message, 'error')
      }
    })
  }

  function addSource(
    id: string,
    type: Source['type'],
    ref: string,
    onDone: () => void,
    storage?: Source['storage'],
  ) {
    if (!ref.trim()) return
    startTransition(async () => {
      try {
        const updated = await api.post<KB>(`/api/knowledge/${id}/sources`, {
          type,
          ref: ref.trim(),
          ...(storage ? { storage } : {}),
        })
        setItems((xs) => xs.map((x) => (x.id === id ? updated : x)))
        toast('Source added and ingested', 'success')
        onDone()
      } catch (e) {
        toast((e as Error).message, 'error')
      }
    })
  }

  function removeSource(id: string, ref: string) {
    startTransition(async () => {
      try {
        const updated = await api.del<KB>(`/api/knowledge/${id}/sources`, { ref })
        setItems((xs) => xs.map((x) => (x.id === id ? updated : x)))
        toast('Source removed', 'success')
      } catch (e) {
        toast((e as Error).message, 'error')
      }
    })
  }

  function updateSource(id: string, originalRef: string, content: string) {
    if (!content.trim()) return
    startTransition(async () => {
      try {
        const updated = await api.patch<KB>(`/api/knowledge/${id}/sources`, {
          originalRef,
          content: content.trim(),
        })
        setItems((xs) => xs.map((x) => (x.id === id ? updated : x)))
        toast('Text updated and re-ingested', 'success')
      } catch (e) {
        toast((e as Error).message, 'error')
      }
    })
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <p className="text-[12.5px] text-fg-muted">{items.length} knowledge base(s)</p>
        <Button size="sm" onClick={() => setCreating((v) => !v)} className="gap-1.5">
          <Icon name="plus" size="sm" />
          {creating ? 'Cancel' : 'New knowledge base'}
        </Button>
      </div>

      {creating && (
        <Card>
          <CardBody className="grid gap-4 md:grid-cols-2">
            <div>
              <Label>Name</Label>
              <Input
                className="mt-2"
                placeholder="Product FAQ"
                value={name}
                onChange={(e) => setName(e.target.value)}
              />
            </div>
            <div>
              <Label>Embedding namespace (optional)</Label>
              <Input
                className="mt-2 font-mono text-xs"
                placeholder="default"
                value={namespace}
                onChange={(e) => setNamespace(e.target.value)}
              />
            </div>
            {error && <p className="md:col-span-2 text-[13px] text-status-fail">{error}</p>}
            <div className="md:col-span-2 flex justify-end gap-2">
              <Button variant="ghost" size="sm" onClick={() => setCreating(false)}>
                Cancel
              </Button>
              <Button size="sm" onClick={create} disabled={!name.trim()}>
                Create
              </Button>
            </div>
          </CardBody>
        </Card>
      )}

      {items.length === 0 ? (
        <Card>
          <CardBody className="text-[13px] text-fg-muted">
            No knowledge bases yet. Create one and drop in websites, URLs, PDFs, DOCX, or
            pasted text — LivoCall extracts, chunks, embeds, and serves them at call time.
          </CardBody>
        </Card>
      ) : (
        <div className="grid gap-4">
          {items.map((kb) => (
            <Card key={kb.id} className="overflow-hidden">
              <div className="flex items-start justify-between border-b border-line p-5">
                <div>
                  <CardTitle>{kb.name}</CardTitle>
                  <CardDescription>
                    {kb.sources.length} source(s) · {kb.quality?.chunkCount ?? calculateClientQuality(kb).chunkCount} chunks
                  </CardDescription>
                </div>
                <div className="flex items-center gap-2">
                  <Badge variant="outline">{kb.embeddingNamespace || 'default'}</Badge>
                  <Button
                    size="sm"
                    variant="ghost"
                    onClick={() => remove(kb.id)}
                    disabled={pending}
                  >
                    Delete
                  </Button>
                </div>
              </div>
              <CardBody className="grid gap-5 xl:grid-cols-[minmax(0,1fr)_360px]">
                <div className="space-y-4">
                  <SourceAdder
                    onAdd={(type, ref, done, storage) => addSource(kb.id, type, ref, done, storage)}
                    disabled={pending}
                  />
                  <SourceList
                    sources={kb.sources}
                    onRemove={(ref) => removeSource(kb.id, ref)}
                    onUpdate={(originalRef, ref) => updateSource(kb.id, originalRef, ref)}
                    disabled={pending}
                  />
                </div>
                <QualityScore quality={kb.quality ?? calculateClientQuality(kb)} />
              </CardBody>
            </Card>
          ))}
        </div>
      )}
    </div>
  )
}

function QualityScore({ quality }: { quality: Quality }) {
  const tone = quality.score >= 80 ? 'live' : quality.score >= 50 ? 'warn' : 'fail'
  return (
    <div className="rounded-md border border-line bg-bg-subtle p-3">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <p className="text-[12.5px] font-medium text-fg">Knowledge quality score</p>
          <p className="text-[12px] text-fg-muted">
            Measures source readiness, answer coverage, content volume, and ingestion health.
          </p>
        </div>
        <Badge variant={tone}>{quality.score}/100</Badge>
      </div>
      <div className="mt-3 h-2 overflow-hidden rounded-full bg-bg-muted">
        <div
          className={
            tone === 'live'
              ? 'h-full bg-status-live'
              : tone === 'warn'
                ? 'h-full bg-status-warn'
                : 'h-full bg-status-fail'
          }
          style={{ width: `${quality.score}%` }}
        />
      </div>
      <div className="mt-3 grid gap-2 text-[12px] text-fg-muted sm:grid-cols-4">
        <span>{quality.readySources} ready</span>
        <span>{quality.failedSources} failed</span>
        <span>{quality.chunkCount} chunks</span>
        <span>{quality.extractedChars.toLocaleString()} chars</span>
      </div>
      {quality.recommendations.length > 0 && (
        <ul className="mt-3 list-disc space-y-1 pl-4 text-[12px] text-fg-muted">
          {quality.recommendations.map((r) => (
            <li key={r}>{r}</li>
          ))}
        </ul>
      )}
    </div>
  )
}

function SourceList({
  sources,
  onRemove,
  onUpdate,
  disabled,
}: {
  sources: Source[]
  onRemove: (ref: string) => void
  onUpdate: (originalRef: string, content: string) => void
  disabled?: boolean
}) {
  if (sources.length === 0)
    return (
      <p className="text-[12.5px] text-fg-muted">No sources yet. Add one below.</p>
    )
  return (
    <ul className="divide-y divide-line rounded-md border border-line">
      {sources.map((s) => (
        <SourceRow
          key={s.ref}
          source={s}
          onRemove={onRemove}
          onUpdate={onUpdate}
          disabled={disabled}
        />
      ))}
    </ul>
  )
}

function SourceRow({
  source: s,
  onRemove,
  onUpdate,
  disabled,
}: {
  source: Source
  onRemove: (ref: string) => void
  onUpdate: (originalRef: string, content: string) => void
  disabled?: boolean
}) {
  const [editing, setEditing] = useState(false)
  const isInlineText =
    s.type === 'text' &&
    (s.storage?.provider === 'inline' || (!s.storage?.provider && !s.storage?.key))
  const editableText = isInlineText ? s.ref : s.content || ''
  const [draft, setDraft] = useState(editableText)
  const displayTitle = s.title || (isInlineText ? 'Written text source' : s.ref)
  const fallbackPreview = `No saved text for this older source yet.
Reference: ${s.ref}
Stored as: ${s.storage?.provider || 'external'}${s.storage?.key ? ` - ${s.storage.key}` : ''}
Extracted characters: ${s.ingestion?.extractedChars ?? 0}
${s.ingestion?.error ? `Error: ${s.ingestion.error}` : ''}`
  return (
    <li className="flex items-start gap-3 px-3 py-3 text-[12.5px]">
      <span className="mt-0.5 grid size-6 shrink-0 place-items-center rounded border border-line bg-bg">
        <Icon name={SOURCE_ICON[s.type]} size="xs" />
      </span>
      <div className="min-w-0 flex-1">
        <div className="flex flex-wrap items-center gap-2">
          <span className="font-mono text-[11.5px] uppercase tracking-[0.12em] text-fg-faint">
            {s.type}
          </span>
          <Badge
            variant={
              s.ingestion?.status === 'ready'
                ? 'live'
                : s.ingestion?.status === 'failed'
                  ? 'fail'
                  : 'warn'
            }
          >
            {s.ingestion?.status || 'queued'}
          </Badge>
          <span className="text-fg-faint">{s.ingestion?.chunkCount ?? 0} chunks</span>
        </div>
        <p className="mt-1 truncate font-medium text-fg" title={displayTitle}>
          {displayTitle}
        </p>
        <details className="mt-1">
          <summary className="cursor-pointer text-[12px] text-fg-muted hover:text-fg">
            View / edit text
          </summary>
          {editing ? (
            <div className="mt-2 space-y-2">
              <Textarea value={draft} onChange={(e) => setDraft(e.target.value)} rows={7} />
              <div className="flex gap-2">
                <Button
                  size="sm"
                  disabled={disabled || !draft.trim()}
                  onClick={() => {
                    onUpdate(s.ref, draft)
                    setEditing(false)
                  }}
                >
                  Save & re-ingest
                </Button>
                <Button
                  size="sm"
                  variant="ghost"
                  onClick={() => {
                    setDraft(editableText)
                    setEditing(false)
                  }}
                >
                  Cancel
                </Button>
              </div>
            </div>
          ) : (
            <>
              <pre className="mt-2 max-h-44 overflow-auto whitespace-pre-wrap rounded border border-line bg-bg-subtle p-2 font-mono text-[11.5px] text-fg-muted">
{editableText || fallbackPreview}
              </pre>
              <Button
                size="sm"
                variant="ghost"
                className="mt-2"
                onClick={() => {
                  setDraft(editableText)
                  setEditing(true)
                }}
              >
                Edit text
              </Button>
            </>
          )}
        </details>
      </div>
      <button
        type="button"
        className="text-fg-muted hover:text-status-fail"
        onClick={() => onRemove(s.ref)}
        aria-label="Remove source"
        disabled={disabled}
      >
        <Icon name="x" size="xs" />
      </button>
    </li>
  )
}

function SourceAdder({
  onAdd,
  disabled,
}: {
  onAdd: (type: Source['type'], ref: string, done: () => void, storage?: Source['storage']) => void
  disabled?: boolean
}) {
  const [type, setType] = useState<Source['type']>('text')
  const [ref, setRef] = useState('')
  const [uploading, setUploading] = useState(false)
  const { toast } = useToast()
  const isText = type === 'text'

  async function upload(file: File | undefined) {
    if (!file) return
    setUploading(true)
    try {
      const form = new FormData()
      form.set('file', file)
      const res = await fetch('/api/uploads/knowledge', {
        method: 'POST',
        body: form,
      })
      const json = await res.json()
      if (!res.ok) throw new Error(json?.error?.message || 'Upload failed')
      onAdd(json.type, json.ref, () => {}, json.storage)
    } catch (e) {
      toast((e as Error).message, 'error')
    } finally {
      setUploading(false)
    }
  }

  return (
    <div className="space-y-3">
      <div className="grid gap-2 md:grid-cols-[140px_1fr_auto]">
        <select
          value={type}
          onChange={(e) => setType(e.target.value as Source['type'])}
          className="h-10 rounded border border-line bg-bg-subtle px-3 text-sm"
        >
          <option value="text">Text</option>
          <option value="url">URL</option>
          <option value="website">Website</option>
          <option value="pdf">PDF</option>
          <option value="docx">DOCX</option>
        </select>
        {isText ? (
          <Textarea
            placeholder="Write FAQs, pricing, delivery rules, refund policy, handoff notes..."
            rows={7}
            value={ref}
            onChange={(e) => setRef(e.target.value)}
          />
        ) : (
          <Input
            placeholder={type === 'url' || type === 'website' ? 'https://...' : 'https://.../file'}
            value={ref}
            onChange={(e) => setRef(e.target.value)}
          />
        )}
        <Button
          size="sm"
          onClick={() =>
            onAdd(
              type,
              ref,
              () => {
                setRef('')
              },
              isText ? { provider: 'inline', key: '' } : undefined,
            )
          }
          disabled={disabled || !ref.trim()}
        >
          {isText ? 'Save text' : 'Add source'}
        </Button>
      </div>
      <label className="flex cursor-pointer items-center justify-between gap-3 rounded-md border border-dashed border-line bg-bg-subtle px-3 py-3 text-[12.5px] text-fg-muted transition hover:border-fg/30">
        <span>
          Upload PDF, TXT, Markdown, or DOCX file
          <span className="block text-[11px] text-fg-faint">Stored privately and ingested by the KB worker.</span>
        </span>
        <span className="rounded bg-bg px-2 py-1 text-fg">{uploading ? 'Uploading...' : 'Choose file'}</span>
        <input
          type="file"
          accept=".pdf,.txt,.md,.docx,application/pdf,text/plain,text/markdown,application/vnd.openxmlformats-officedocument.wordprocessingml.document"
          className="hidden"
          disabled={disabled || uploading}
          onChange={(e) => void upload(e.target.files?.[0])}
        />
      </label>
    </div>
  )
}
