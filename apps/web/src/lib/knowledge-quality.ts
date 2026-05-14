type SourceForQuality = {
  type?: string
  ingestion?: {
    status?: string | null
    chunkCount?: number | null
    extractedChars?: number | null
  } | null
}

export function calculateKnowledgeQuality(kb: { sources?: SourceForQuality[] | null }) {
  const sources = kb.sources || []
  const readySources = sources.filter((s) => s.ingestion?.status === 'ready').length
  const failedSources = sources.filter((s) => s.ingestion?.status === 'failed').length
  const chunkCount = sources.reduce((sum, s) => sum + Number(s.ingestion?.chunkCount || 0), 0)
  const extractedChars = sources.reduce(
    (sum, s) => sum + Number(s.ingestion?.extractedChars || 0),
    0,
  )
  const hasWebsite = sources.some((s) => s.type === 'website' || s.type === 'url')
  const hasText = sources.some((s) => s.type === 'text')
  const recommendations: string[] = []

  if (sources.length === 0) recommendations.push('Add at least one FAQ, website, PDF, or text source.')
  if (readySources === 0 && sources.length > 0) recommendations.push('Fix ingestion errors so agents can use this knowledge.')
  if (extractedChars < 2000) recommendations.push('Add more product, pricing, delivery, and policy details.')
  if (chunkCount < 8) recommendations.push('Add enough Q&A content to create at least 8 searchable chunks.')
  if (!hasWebsite) recommendations.push('Add the business website or product pages.')
  if (!hasText) recommendations.push('Add a short “golden answers” text source for common objections.')
  if (failedSources > 0) recommendations.push('Remove or re-add failed sources.')

  const sourceScore = Math.min(25, readySources * 8)
  const chunkScore = Math.min(25, chunkCount * 2)
  const volumeScore = Math.min(25, Math.floor(extractedChars / 200))
  const varietyScore = Math.min(15, new Set(sources.map((s) => s.type)).size * 5)
  const reliabilityScore = failedSources === 0 ? 10 : Math.max(0, 10 - failedSources * 4)
  const score = Math.max(
    0,
    Math.min(100, sourceScore + chunkScore + volumeScore + varietyScore + reliabilityScore),
  )

  return {
    score,
    readySources,
    failedSources,
    chunkCount,
    extractedChars,
    recommendations: recommendations.slice(0, 4),
    updatedAt: new Date(),
  }
}
