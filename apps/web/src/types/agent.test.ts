import { describe, expect, it } from 'vitest'
import { defaultLanguageForTier, languageOptionsForTier } from './agent'

describe('agent language options', () => {
  it('defaults Gemini Live agents to Bangla BCP-47 bn', () => {
    expect(defaultLanguageForTier('gemini_live')).toBe('bn')
    expect(languageOptionsForTier('gemini_live').map((option) => option.k)).toContain('bn')
  })

  it('defaults pipeline Soniox agents to exact Bangla language code', () => {
    expect(defaultLanguageForTier('pipeline')).toBe('bn')
    expect(languageOptionsForTier('pipeline').map((option) => option.k)).toContain('bn')
  })
})
