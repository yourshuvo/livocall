import { z } from 'zod'

export const SupervisorControlBody = z.object({
  action: z.enum(['listen', 'barge']),
  targetE164: z.string().regex(/^\+\d{8,15}$/, 'must be E.164'),
})

export type SupervisorControlAction = z.infer<typeof SupervisorControlBody>['action']

export interface SupervisorControlResult {
  ok: boolean
  streamUrl?: string
  supervisorLegUuid?: string
}

export function supervisorSuccessEvent({
  action,
  supervisorId,
  targetE164,
  result,
}: {
  action: SupervisorControlAction
  supervisorId: string
  targetE164: string
  result: SupervisorControlResult
}) {
  return {
    action,
    supervisorId,
    at: new Date(),
    ok: result.ok,
    streamUrl: result.streamUrl || '',
    targetE164,
    supervisorLegUuid: result.supervisorLegUuid || '',
  }
}

export function supervisorFailureEvent({
  action,
  supervisorId,
  targetE164,
  error,
}: {
  action: SupervisorControlAction
  supervisorId: string
  targetE164: string
  error: unknown
}) {
  return {
    action,
    supervisorId,
    at: new Date(),
    ok: false,
    targetE164,
    error: error instanceof Error ? error.message : 'voice service error',
  }
}
