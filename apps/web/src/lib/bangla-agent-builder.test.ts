import { describe, expect, it } from 'vitest'
import {
  EMPTY_AGENT_BUILDER,
  buildBanglaAgentPrompt,
  buildRevenueOutcomeConfig,
} from '@/lib/bangla-agent-builder'

describe('Bangla agent builder revenue outcomes', () => {
  it('auto-adds an order revenue label from ecommerce goals', () => {
    const config = buildRevenueOutcomeConfig({
      ...EMPTY_AGENT_BUILDER,
      industry: 'ecommerce',
      callGoal: 'Confirm COD orders and delivery details',
    })

    expect(config.enabled).toBe(true)
    expect(config.labels[0]).toMatchObject({
      key: 'order_confirmed',
      label: 'Order confirmed',
      conversion: true,
    })
    expect(config.labels.map((label) => label.key)).toContain('unknown')
  })

  it('includes generated revenue outcomes in the prompt payload', () => {
    const prompt = buildBanglaAgentPrompt({
      ...EMPTY_AGENT_BUILDER,
      industry: 'clinic',
      callGoal: 'Book appointments for patients',
    })

    expect(prompt.outcomeConfig.labels[0]).toMatchObject({
      key: 'booking_confirmed',
      label: 'Booking confirmed',
      conversion: true,
    })
    expect(prompt.language).toBe('bn')
  })
})
