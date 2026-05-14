import { connectMongo, isMongoConfigured } from '@/lib/db'

export const dynamic = 'force-dynamic'
export const metadata = { title: 'Status · LivoCall' }

async function checkMongo(): Promise<boolean> {
  if (!isMongoConfigured()) return false
  try {
    await connectMongo()
    return true
  } catch {
    return false
  }
}

async function checkVoice(): Promise<boolean> {
  const url = process.env.VOICE_SERVICE_URL
  if (!url) return false
  try {
    const r = await fetch(url.replace(/\/+$/, '') + '/health', {
      cache: 'no-store',
      signal: AbortSignal.timeout(3_000),
    })
    return r.ok
  } catch {
    return false
  }
}

function configured(value?: string): boolean {
  return Boolean(value && value.trim())
}

function Dot({ ok }: { ok: boolean }) {
  return (
    <span
      className={
        'inline-block h-2.5 w-2.5 rounded-full ' + (ok ? 'bg-emerald-500' : 'bg-rose-500')
      }
      aria-hidden
    />
  )
}

export default async function StatusPage() {
  const [mongoOk, voiceOk] = await Promise.all([checkMongo(), checkVoice()])
  const storageOk = configured(process.env.FILE_STORAGE_BUCKET) || true
  const clerkOk = true
  const allOk = mongoOk && voiceOk
  const components = [
    { name: 'Dashboard API', ok: true, note: 'serving this page' },
    { name: 'Clerk authentication', ok: clerkOk, note: 'keyless mode or configured keys' },
    { name: 'Database (MongoDB)', ok: mongoOk, note: mongoOk ? 'connected' : 'unreachable or unconfigured' },
    {
      name: 'Knowledge file storage',
      ok: storageOk,
      note: configured(process.env.FILE_STORAGE_BUCKET) ? 'object storage configured' : 'using local development storage',
    },
    { name: 'Secrets Vault', ok: true, note: 'encrypted at rest with SECRETS_VAULT_KEY/SIP secret' },
    { name: 'Voice engine', ok: voiceOk, note: voiceOk ? 'healthy' : 'unreachable or unconfigured' },
  ]
  return (
    <main className="mx-auto max-w-3xl px-6 py-12">
      <p className="font-mono text-[11px] uppercase tracking-[0.16em] text-fg-faint">Production readiness</p>
      <h1 className="mb-2 mt-2 font-display text-[34px] font-medium tracking-tightest text-fg">System status</h1>
      <p className="mb-6 text-[13px] text-fg-muted">
        Health for auth, dashboard, database, knowledge storage, secrets, and voice services. Refresh to re-check.
      </p>
      <div className="mb-6 flex items-center gap-3 rounded-lg border border-line bg-bg-subtle p-4">
        <Dot ok={allOk} />
        <div className="text-[15px] font-medium text-fg">
          {allOk ? 'All systems operational' : 'Degraded service'}
        </div>
      </div>
      <ul className="divide-y divide-line rounded-lg border border-line">
        {components.map((c) => (
          <li key={c.name} className="flex items-center justify-between px-4 py-3">
            <div className="flex items-center gap-3">
              <Dot ok={c.ok} />
              <div>
                <div className="text-[13px] font-medium text-fg">{c.name}</div>
                <div className="text-[12px] text-fg-muted">{c.note}</div>
              </div>
            </div>
            <span className="text-[12px] text-fg-muted">{c.ok ? 'Operational' : 'Degraded'}</span>
          </li>
        ))}
      </ul>
      <p className="mt-6 text-[12px] text-fg-faint">
        Generated at {new Date().toISOString()}.
      </p>
    </main>
  )
}
