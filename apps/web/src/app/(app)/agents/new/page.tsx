import { NewAgentForm } from './form'
import { connectMongo, isMongoConfigured } from '@/lib/db'
import { getSession } from '@/lib/session'
import { kbToJson } from '@/lib/serialize'
import { KnowledgeBase, type KnowledgeBaseLean } from '@/models/KnowledgeBase'

export const metadata = { title: 'New agent · LivoCall' }

export default async function NewAgentPage() {
  const session = await getSession()
  let kbs: KnowledgeBaseLean[] = []
  if (isMongoConfigured() && session.orgId) {
    try {
      await connectMongo()
      kbs = await KnowledgeBase.find({ orgId: session.orgId }).sort({ name: 1 }).lean<KnowledgeBaseLean[]>()
    } catch {
      kbs = []
    }
  }

  const kbOptions = kbs
    .map((kb) => kbToJson(kb))
    .filter((kb): kb is ReturnType<typeof kbToJson> & { id: string } => Boolean(kb.id))
    .map((kb) => ({ id: kb.id, name: kb.name, quality: kb.quality }))

  return <NewAgentForm kbs={kbOptions} />
}
