import { connectMongo } from '@/lib/db'
import { verifyProductionIndexes } from '@/lib/index-verification'

async function main() {
  await connectMongo()
  const results = await verifyProductionIndexes()
  for (const result of results) {
    const prefix = result.ok ? 'ok' : 'failed'
    console.log(`${prefix}\t${result.model}\t${result.message}`)
  }
  if (results.some((result) => !result.ok)) process.exitCode = 1
}

main().catch((error) => {
  console.error(error)
  process.exit(1)
})
