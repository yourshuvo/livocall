import { TopBar } from '@/components/app/top-bar'
import { connectMongo, isMongoConfigured } from '@/lib/db'
import { getSession } from '@/lib/session'
import { KnowledgeBase, type KnowledgeBaseLean } from '@/models/KnowledgeBase'
import { kbToJson } from '@/lib/serialize'
import { KnowledgeClient } from './client'

export const dynamic = 'force-dynamic'

export default async function KnowledgePage() {
  const session = await getSession()
  let kbs: KnowledgeBaseLean[] = []
  if (isMongoConfigured()) {
    try {
      await connectMongo()
      kbs = await KnowledgeBase.find({ orgId: session.orgId })
        .sort({ updatedAt: -1 })
        .lean<KnowledgeBaseLean[]>()
    } catch {
      // empty
    }
  }

  return (
    <>
      <TopBar title="Knowledge base" searchPlaceholder="Search knowledge bases..." />
      <div className="flex-1 overflow-y-auto bg-bg">
        <div className="border-b border-line/70 px-6 py-5">
          <p className="font-mono text-[10.5px] uppercase tracking-[0.14em] text-fg-faint">Retrieval</p>
          <h1 className="mt-1 text-[20px] font-semibold tracking-tight text-fg">Knowledge bases</h1>
          <p className="mt-1 text-[13px] text-fg-muted">
            Drop websites, URLs, PDFs, DOCX, or text. We extract, chunk + embed and serve them to your agents at call time — typically under 200ms per query.
          </p>
        </div>
        <div className="px-6 py-6">
          <KnowledgeClient initial={kbs.map((k) => kbToJson(k)) as never} />
        </div>
      </div>
    </>
  )
}
