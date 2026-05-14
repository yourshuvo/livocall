export const dynamic = 'force-dynamic'
import { NextResponse } from 'next/server'
import { connectMongo } from '@/lib/db'
import { Campaign } from '@/models/Campaign'
import { authV1, isResponse } from '@/lib/auth/v1'
import { apiError, withErrors } from '@/lib/errors'
import { campaignToJson } from '@/lib/serialize'

export const POST = withErrors(
  async (req: Request, { params }: { params: { id: string } }) => {
    const auth = await authV1(req, 'campaigns:write')
    if (isResponse(auth)) return auth
    await connectMongo()
    const doc = await Campaign.findOneAndUpdate(
      { _id: params.id, orgId: auth.orgId },
      { $set: { status: 'paused' } },
      { new: true },
    ).lean()
    if (!doc) return apiError('not_found', 'campaign not found')
    return NextResponse.json(campaignToJson(doc))
  },
)
