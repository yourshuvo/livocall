import { describe, expect, it } from 'vitest'

import {
  PUBLIC_WEBCALL_SCENARIOS,
  publicWebcallScenarioPrompt,
  resolvePublicWebcallScenario,
} from './public-webcall-scenarios'

describe('public Webcall scenario selection', () => {
  it('offers order confirmation and other selectable demo agents', () => {
    expect(PUBLIC_WEBCALL_SCENARIOS.map((scenario) => scenario.id)).toEqual([
      'general',
      'order-confirmation',
      'customer-support',
      'lead-qualification',
      'appointment-booking',
      'survey',
    ])
  })

  it('normalizes unknown scenario input to the general demo agent', () => {
    expect(resolvePublicWebcallScenario('order-confirmation').id).toBe('order-confirmation')
    expect(resolvePublicWebcallScenario('missing').id).toBe('general')
    expect(resolvePublicWebcallScenario(null).id).toBe('general')
  })

  it('builds a Bangla-first prompt for the selected order confirmation agent', () => {
    const scenario = resolvePublicWebcallScenario('order-confirmation')
    const prompt = publicWebcallScenarioPrompt(scenario)

    expect(scenario.label).toBe('Order confirmation')
    expect(prompt).toContain('Order confirmation')
    expect(prompt).toContain('বাংলা')
    expect(prompt).toContain('অর্ডার')
    expect(prompt).toContain(scenario.firstMessage)
  })
})
