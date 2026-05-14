export const dynamic = 'force-dynamic'
import { NextResponse } from 'next/server'
import { z } from 'zod'
import { isResponse, requireDashboardSession } from '@/lib/api-helpers'
import { apiError, withErrors } from '@/lib/errors'
import { recordAudit } from '@/lib/audit'
import { connectMongo } from '@/lib/db'
import { LedgerEntry } from '@/models/LedgerEntry'
import { PayStationNotConfigured, initiatePayment, payStationConfig } from '@/lib/paystation'

const Body = z.object({
  amountPaisa: z.number().int().positive().max(10_000_000).refine((v) => v % 100 === 0, {
    message: 'PayStation payments must be whole BDT amounts',
  }),
  customerName: z.string().trim().min(2).max(120).optional(),
  customerPhone: z.string().trim().min(10).max(20),
  customerAddress: z.string().trim().max(300).optional(),
})

function defaultCustomerName(sessionName: string | undefined, email: string | undefined) {
  if (sessionName?.trim()) return sessionName.trim()
  const localPart = email?.split('@')[0]?.trim()
  return localPart || 'LivoCall customer'
}

export const POST = withErrors(async (req: Request) => {
  const s = await requireDashboardSession()
  if (isResponse(s)) return s
  if (s.role !== 'owner' && s.role !== 'admin') {
    return apiError('forbidden', 'only owner/admin can top up workspace credits')
  }
  if (!payStationConfig()) {
    return apiError('upstream_error', 'PayStation is not configured')
  }
  if (!s.email) {
    return apiError('invalid_input', 'Your Clerk account needs an email before payment can start')
  }

  const body = Body.parse(await req.json().catch(() => ({})))
  const amountTaka = body.amountPaisa / 100
  const invoice = `livo-${s.orgId}-${Date.now()}`
  const callbackBase = process.env.NEXT_PUBLIC_APP_URL || 'http://localhost:3000'

  try {
    const payment = await initiatePayment({
      amountTaka,
      invoiceNumber: invoice,
      customerName: body.customerName || defaultCustomerName(s.name, s.email),
      customerPhone: body.customerPhone,
      customerEmail: s.email,
      customerAddress: body.customerAddress,
      callbackUrl: `${callbackBase}/api/billing/topup/paystation/callback`,
      reference: `LivoCall top-up ${s.orgId}`,
      checkoutItems: {
        product: 'LivoCall workspace credits',
        amountPaisa: body.amountPaisa,
        orgId: s.orgId,
      },
    })

    await connectMongo()
    await LedgerEntry.create({
      orgId: s.orgId,
      kind: 'topup',
      amountPaisa: 0,
      provider: 'paystation',
      providerRef: payment.invoice_number || invoice,
      description: `pending PayStation ${invoice}`,
      meta: {
        status: 'pending',
        requestedPaisa: body.amountPaisa,
        invoice,
        paymentAmount: payment.payment_amount ?? String(amountTaka),
        paymentUrl: payment.payment_url,
      },
      createdBy: s.userId,
    })

    await recordAudit(s, {
      action: 'billing.topup.initiated',
      meta: {
        amountPaisa: body.amountPaisa,
        provider: 'paystation',
        invoice,
      },
    })

    return NextResponse.json({
      provider: 'paystation',
      invoiceNumber: payment.invoice_number || invoice,
      redirectUrl: payment.payment_url,
      amountPaisa: body.amountPaisa,
    })
  } catch (e) {
    if (e instanceof PayStationNotConfigured) {
      return apiError('upstream_error', 'PayStation is not configured')
    }
    return apiError('upstream_error', `PayStation create failed: ${(e as Error).message}`)
  }
})
