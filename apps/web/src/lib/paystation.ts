export class PayStationNotConfigured extends Error {
  constructor() {
    super('PayStation is not configured')
    this.name = 'PayStationNotConfigured'
  }
}

interface InitiatePaymentInput {
  amountTaka: number
  invoiceNumber: string
  customerName: string
  customerPhone: string
  customerEmail: string
  customerAddress?: string
  callbackUrl: string
  reference?: string
  checkoutItems?: Record<string, unknown>
}

interface PayStationPayment {
  invoice_number?: string
  payment_url: string
  payment_amount?: string
  [key: string]: unknown
}

interface PayStationStatus {
  data?: {
    trx_status?: string
    trx_id?: string
    [key: string]: unknown
  }
  [key: string]: unknown
}

export function payStationConfig() {
  const storeId = process.env.PAYSTATION_STORE_ID || process.env.PAYSTATION_MERCHANT_ID || ''
  const password = process.env.PAYSTATION_PASSWORD || process.env.PAYSTATION_SECRET || ''
  const baseUrl = (
    process.env.PAYSTATION_BASE_URL || 'https://api.paystation.com.bd'
  ).replace(/\/+$/, '')
  if (!storeId || !password) return null
  return { storeId, password, baseUrl }
}

function configured() {
  const cfg = payStationConfig()
  if (!cfg) throw new PayStationNotConfigured()
  return cfg
}

export async function initiatePayment(input: InitiatePaymentInput): Promise<PayStationPayment> {
  const cfg = configured()
  const res = await fetch(`${cfg.baseUrl}/initiate-payment`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({
      store_id: cfg.storeId,
      password: cfg.password,
      invoice_number: input.invoiceNumber,
      currency: 'BDT',
      payment_amount: String(input.amountTaka),
      cust_name: input.customerName,
      cust_phone: input.customerPhone,
      cust_email: input.customerEmail,
      cust_address: input.customerAddress || '',
      callback_url: input.callbackUrl,
      reference: input.reference || input.invoiceNumber,
      checkout_items: input.checkoutItems,
    }),
  })
  const json = (await res.json().catch(() => ({}))) as Partial<PayStationPayment> & {
    payment_url?: string
    checkout_url?: string
    redirect_url?: string
    url?: string
  }
  if (!res.ok) throw new Error(`PayStation returned ${res.status}`)
  const paymentUrl = json.payment_url || json.checkout_url || json.redirect_url || json.url
  if (!paymentUrl) throw new Error('PayStation did not return a checkout URL')
  return {
    ...json,
    payment_url: paymentUrl,
    invoice_number: json.invoice_number || input.invoiceNumber,
  }
}

export async function getTransactionStatus(invoiceNumber: string): Promise<PayStationStatus> {
  const cfg = configured()
  const res = await fetch(`${cfg.baseUrl}/transaction-status`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({
      store_id: cfg.storeId,
      password: cfg.password,
      invoice_number: invoiceNumber,
    }),
  })
  const json = (await res.json().catch(() => ({}))) as PayStationStatus
  if (!res.ok) throw new Error(`PayStation status returned ${res.status}`)
  return json
}