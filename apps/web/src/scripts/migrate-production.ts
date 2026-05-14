import { connectMongo } from '@/lib/db'
import { backfillProductionFields, migrateLocalKnowledgeFiles } from '@/lib/migrations'

async function main() {
  await connectMongo()
  const backfill = await backfillProductionFields()
  const storage = await migrateLocalKnowledgeFiles()
  console.log(JSON.stringify({ backfill, storage }, null, 2))
}

main().catch((error) => {
  console.error(error)
  process.exit(1)
})
