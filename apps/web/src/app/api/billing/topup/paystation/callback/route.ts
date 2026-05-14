export const dynamic = 'force-dynamic'
import { NextResponse } from 'next/server'
import { withErrors } from '@/lib/errors'
import { connectMongo } from '@/lib/db'
import { LedgerEntry } from '@/models/LedgerEntry'
import { postLedger } from '@/lib/billing'
import { emitWebhook } from '@/lib/webhooks'
import { getTransactionStatus } from '@/lib/paystation'

function normalizeStatus(status: string | null | undefined) {
  return (status || '').trim().toLowerCase()
}

function isSuccessfulStatus(status: string | null | undefined) {
  return normalizeStatus(status) === 'successful' || normalizeStatus(status) === 'success'
}

async function readCallbackParams(req: Request) {
  const url = new URL(req.url)
  const params = new URLSearchParams(url.search)
  if (req.method === 'POST') {
    const contentType = req.headers.get('content-type') || ''
    if (contentType.includes('application/json')) {
      const body = (await req.json().catch(() => ({}))) as Record<string, unknown>
      for (const [key, value] of Object.entries(body)) {
        if (typeof value === 'string') params.set(key, value)
      }
    } else {
      const form = await req.formData().catch(() => null)
      form?.forEach((value, key) => {
        if (typeof value === 'string') params.set(key, value)
      })
    }
  }
  return params
}

export const GET = withErrors(async (req: Request) => {
  const params = await readCallbackParams(req)
  const invoice = params.get('invoice_number') || ''
  const callbackStatus = params.get('status') || ''
  const trxId = params.get('trx_id') || ''

  if (!invoice) {
    return NextResponse.redirect(new URL('/billing?paystation=missing_invoice', req.url))
  }

  await connectMongo()
  const pending = await LedgerEntry.findOne({
    provider: 'paystation',
    providerRef: invoice,
    'meta.status': 'pending',
  })

  if (!pending) {
    return NextResponse.redirect(new URL('/billing?paystation=already_processed', req.url))
  }

  if (!isSuccessfulStatus(callbackStatus)) {
    await LedgerEntry.updateOne(
      { _id: pending._id },
      {
        $set: {
          description: `PayStation ${callbackStatus || 'failed'} ${invoice}`,
          'meta.status': normalizeStatus(callbackStatus) || 'failed',
          'meta.callbackStatus': callbackStatus,
          'meta.trxId': trxId,
        },
      },
    )
    return NextResponse.redirect(new URL('/billing?paystation=failed', req.url))
  }

  let status
  try {
    status = await getTransactionStatus(invoice)
  } catch (e) {
    await LedgerEntry.updateOne(
      { _id: pending._id },
      {
        $set: {
          description: `PayStation verify-failed ${invoice}`,
          'meta.status': 'verify_failed',
          'meta.error': (e as Error).message,
          'meta.callbackStatus': callbackStatus,
          'meta.trxId': trxId,
        },
      },
    )
    return NextResponse.redirect(new URL('/billing?paystation=verify_failed', req.url))
  }

  const trxStatus = status.data?.trx_status || ''
  if (!isSuccessfulStatus(trxStatus)) {
    await LedgerEntry.updateOne(
      { _id: pending._id },
      {
        $set: {
          description: `PayStation ${trxStatus || 'failed'} ${invoice}`,
          'meta.status': normalizeStatus(trxStatus) || 'failed',
          'meta.callbackStatus': callbackStatus,
          'meta.trxId': status.data?.trx_id || trxId,
          'meta.transactionStatus': status.data,
        },
      },
    )
    return NextResponse.redirect(new URL('/billing?paystation=' + encodeURIComponent(trxStatus || 'failed'), req.url))
  }

  const requested = (pending.meta as { requestedPaisa?: number } | null)?.requestedPaisa ?? 0
  const balance = await postLedger({
    orgId: pending.orgId.toString(),
    kind: 'topup',
    amountPaisa: requested,
    description: `PayStation top-up ${status.data?.trx_id || trxId || invoice}`,
    provider: 'paystation',
    providerRef: status.data?.trx_id || trxId || invoice,
    createdBy: pending.createdBy ? pending.createdBy.toString() : undefined,
  })

  await LedgerEntry.updateOne(
    { _id: pending._id },
    {
      $set: {
        'meta.status': 'confirmed',
        'meta.callbackStatus': callbackStatus,
        'meta.trxId': status.data?.trx_id || trxId,
        'meta.transactionStatus': status.data,
      },
    },
  )

  emitWebhook(pending.orgId.toString(), 'topup.confirmed', {
    amountPaisa: requested,
    provider: 'paystation',
    balanceAfterPaisa: balance,
    invoiceNumber: invoice,
    trxId: status.data?.trx_id || trxId,
  }).catch(() => {})

  return NextResponse.redirect(new URL('/billing?paystation=confirmed', req.url))
})

export const POST = GET
