import type { Tier } from '@/types/agent'

// Cost per minute, as integer paisa (BDT × 100). See ARCHITECTURE.md §7.
export const tierCostPaisaPerMin: Record<Tier, number> = {
  gemini_live: 700,
  grok_voice: 700,
  pipeline: 600,
  dtmf: 200,
}

export const tierMargin: Record<Tier, number> = {
  gemini_live: 320, // ~৳3.8 cost → ~৳7 sell
  grok_voice: 20,
  pipeline: 240,
  dtmf: 115,
}

export function quoteCallPaisa(tier: Tier, durationSec: number): number {
  const minutes = Math.ceil(durationSec / 60)
  return minutes * tierCostPaisaPerMin[tier]
}
