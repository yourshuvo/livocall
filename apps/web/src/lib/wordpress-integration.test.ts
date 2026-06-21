import { describe, expect, it } from 'vitest'
import {
  buildWordPressFieldCatalog,
  createWordPressRegistration,
  hashWordPressToken,
  pkceChallengeForVerifier,
  renderWordPressTemplate,
  sanitizeWordPressContactAttrs,
  sanitizeWordPressPayload,
  validateWordPressOAuthRedirect,
  verifyPkceChallenge,
  wordpressMetadataFromEvent,
  normalizeWordPressContactTags,
} from './wordpress-integration'

describe('WordPress integration helpers', () => {
  it('creates a hashed one-time registration token', () => {
    const registration = createWordPressRegistration()

    expect(registration.token).toMatch(/^lvo_wpconn_/)
    expect(registration.config.registrationTokenHash).toBe(hashWordPressToken(registration.token))
    expect(registration.config.registrationTokenHash).not.toBe(registration.token)
    expect(new Date(registration.config.registrationTokenExpiresAt || '').getTime()).toBeGreaterThan(
      Date.now(),
    )
  })

  it('builds insertable tokens from WooCommerce samples', () => {
    const fields = buildWordPressFieldCatalog([
      {
        kind: 'woocommerce_order',
        sample: {
          customer: { name: 'Rahim Uddin', phone: '+8801711000000' },
          order: { number: 'LC-1234', total: '2450', currency: 'BDT' },
          products: [{ name: 'Black Panjabi', quantity: 2 }],
        },
      },
    ])

    expect(fields.map((field) => field.token)).toEqual(
      expect.arrayContaining([
        '{{customer.name}}',
        '{{order.number}}',
        '{{order.total}}',
        '{{products.0.quantity}}',
      ]),
    )
  })

  it('redacts sensitive keys and keeps safe order fields', () => {
    const sanitized = sanitizeWordPressPayload({
      customer: { name: 'Rahim Uddin' },
      payment: { card_number: '4111111111111111', method: 'cash' },
    })

    expect(sanitized).toEqual({
      customer: { name: 'Rahim Uddin' },
      payment: { card_number: '[redacted]', method: 'cash' },
    })
  })

  it('renders prompt tokens with fallback text', () => {
    const text = renderWordPressTemplate(
      'Hello {{ customer.name }}, order {{order.number|unknown}} total {{order.total|0}}.',
      { customer: { name: 'Rahim' }, order: { total: '2450' } },
    )

    expect(text).toBe('Hello Rahim, order unknown total 2450.')
  })

  it('flattens event metadata for prompt rendering and idempotency lookup', () => {
    const metadata = wordpressMetadataFromEvent({
      connectionId: 'conn_1',
      eventId: 'order:1:processing:1',
      trigger: 'order.processing',
      resourceType: 'order',
      resourceId: '1',
      payload: {
        customer: { name: 'Rahim' },
        order: { number: 'LC-1234' },
        products: [{ quantity: 2 }],
      },
    }) as Record<string, string>

    expect(metadata.wordpressEventId).toBe('order:1:processing:1')
    expect(metadata.wordpressResourceType).toBe('order')
    expect(metadata.customer_name).toBe('Rahim')
    expect(metadata.order_number).toBe('LC-1234')
    expect(metadata.products_0_quantity).toBe('2')
    expect(JSON.parse(metadata.wordpressPayloadJson).customer.name).toBe('Rahim')
  })

  it('validates WordPress OAuth redirect host and scheme', () => {
    const ok = validateWordPressOAuthRedirect({
      siteUrl: 'https://store.example.com/',
      callbackUrl: 'https://store.example.com/wp-admin/admin-post.php?action=livocall_oauth_callback',
    })

    expect(ok.ok).toBe(true)
    expect(
      validateWordPressOAuthRedirect({
        siteUrl: 'https://store.example.com/',
        callbackUrl: 'https://evil.example.net/callback',
      }).ok,
    ).toBe(false)
    expect(
      validateWordPressOAuthRedirect({
        siteUrl: 'javascript:alert(1)',
        callbackUrl: 'https://store.example.com/callback',
      }).ok,
    ).toBe(false)
  })

  it('verifies OAuth PKCE challenges', () => {
    const verifier = 'test-verifier-with-enough-length-for-pkce'
    const challenge = pkceChallengeForVerifier(verifier)

    expect(verifyPkceChallenge(verifier, challenge)).toBe(true)
    expect(verifyPkceChallenge(`${verifier}-tampered`, challenge)).toBe(false)
  })

  it('sanitizes WordPress contact attrs for Mongo contact metadata', () => {
    expect(
      sanitizeWordPressContactAttrs({
        email: 'buyer@example.com',
        '$bad.key': 'unsafe',
        password: 'secret',
        nested: { no: 'objects' },
      }),
    ).toEqual({
      email: 'buyer@example.com',
      bad_key: 'unsafe',
    })
  })

  it('normalizes WordPress contact tags and keeps wordpress source tag', () => {
    expect(normalizeWordPressContactTags(['WooCommerce', 'VIP Customer!', 'wordpress'])).toEqual([
      'wordpress',
      'woocommerce',
      'vip-customer-',
    ])
  })
})
