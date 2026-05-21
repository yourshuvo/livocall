type WorkspaceRole = 'owner' | 'admin' | 'agent'

export interface WorkspaceInviteEmailParams {
  workspaceName: string
  workspaceSlug: string
  workspaceLogoUrl?: string | null
  inviterName?: string | null
  inviterEmail?: string | null
  inviteeEmail: string
  role: WorkspaceRole
  acceptUrl: string
  expiresAt: Date
}

type RenderedWorkspaceInviteEmailParams = Omit<WorkspaceInviteEmailParams, 'role'> & {
  inviter: string
  role: string
  expires: string
}

export function renderWorkspaceInviteEmail(params: WorkspaceInviteEmailParams) {
  const workspaceName = params.workspaceName || 'LivoCall workspace'
  const inviter = params.inviterName || params.inviterEmail || 'A workspace admin'
  const role = formatRole(params.role)
  const expires = formatDate(params.expiresAt)
  const subject = `${inviter} invited you to ${workspaceName}`

  return {
    subject,
    text: [
      `${inviter} invited you to join ${workspaceName} on LivoCall as ${role}.`,
      '',
      `Accept the invitation before ${expires}:`,
      params.acceptUrl,
      '',
      `This invitation was sent to ${params.inviteeEmail}. If you were not expecting it, you can ignore this email.`,
    ].join('\n'),
    html: renderHtml({
      ...params,
      workspaceName,
      inviter,
      role,
      expires,
    }),
  }
}

function renderHtml({
  workspaceName,
  workspaceSlug,
  workspaceLogoUrl,
  inviter,
  inviterEmail,
  inviteeEmail,
  role,
  acceptUrl,
  expires,
}: RenderedWorkspaceInviteEmailParams) {
  const safeWorkspaceName = escapeHtml(workspaceName)
  const safeWorkspaceSlug = escapeHtml(workspaceSlug)
  const safeInviter = escapeHtml(inviter)
  const safeInviterEmail = escapeHtml(inviterEmail || '')
  const safeInviteeEmail = escapeHtml(inviteeEmail)
  const safeRole = escapeHtml(role)
  const safeAcceptUrl = escapeHtml(acceptUrl)
  const safeExpires = escapeHtml(expires)
  const logo = renderLogo(workspaceName, workspaceLogoUrl)

  return `<!doctype html>
<html>
  <head>
    <meta http-equiv="Content-Type" content="text/html; charset=utf-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1" />
    <title>${safeInviter} invited you to ${safeWorkspaceName}</title>
  </head>
  <body style="margin:0;background:#f5f5f4;color:#171717;font-family:Inter,Segoe UI,Arial,sans-serif;">
    <div style="display:none;max-height:0;overflow:hidden;opacity:0;">
      Join ${safeWorkspaceName} on LivoCall as ${safeRole}.
    </div>
    <table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="background:#f5f5f4;padding:32px 16px;">
      <tr>
        <td align="center">
          <table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="max-width:640px;background:#ffffff;border:1px solid #e5e5e5;border-radius:18px;overflow:hidden;">
            <tr>
              <td style="padding:28px 28px 22px;border-bottom:1px solid #eeeeec;background:#fbfbfa;">
                <table role="presentation" width="100%" cellspacing="0" cellpadding="0">
                  <tr>
                    <td style="width:72px;vertical-align:top;">${logo}</td>
                    <td style="vertical-align:top;">
                      <div style="font-size:12px;line-height:18px;text-transform:uppercase;letter-spacing:.14em;color:#737373;font-weight:700;">Workspace invitation</div>
                      <div style="font-size:24px;line-height:30px;color:#171717;font-weight:760;margin-top:6px;">Join ${safeWorkspaceName}</div>
                      <div style="font-size:13px;line-height:20px;color:#737373;margin-top:5px;">LivoCall workspace <span style="font-family:ui-monospace,SFMono-Regular,Consolas,monospace;">/${safeWorkspaceSlug}</span></div>
                    </td>
                  </tr>
                </table>
              </td>
            </tr>
            <tr>
              <td style="padding:28px;">
                <p style="margin:0;font-size:16px;line-height:25px;color:#262626;">
                  ${safeInviter} invited you to collaborate in <strong>${safeWorkspaceName}</strong> on LivoCall.
                </p>
                <table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="margin-top:22px;border:1px solid #eeeeec;border-radius:12px;overflow:hidden;">
                  ${detailRow('Invited email', safeInviteeEmail)}
                  ${detailRow('Workspace role', safeRole)}
                  ${detailRow('Expires', safeExpires)}
                  ${safeInviterEmail ? detailRow('Invited by', safeInviterEmail) : ''}
                </table>
                <div style="margin-top:26px;">
                  <a href="${safeAcceptUrl}" style="display:inline-block;background:#171717;color:#ffffff;text-decoration:none;border-radius:10px;padding:13px 20px;font-size:14px;font-weight:760;">
                    Accept workspace invite
                  </a>
                </div>
                <p style="margin:18px 0 0;font-size:13px;line-height:21px;color:#737373;">
                  The button opens LivoCall where you can sign in or sign up with this email, then confirm access to the workspace.
                </p>
              </td>
            </tr>
            <tr>
              <td style="padding:18px 28px;background:#fbfbfa;border-top:1px solid #eeeeec;">
                <p style="margin:0;font-size:12px;line-height:19px;color:#737373;">
                  If you were not expecting this invitation, you can safely ignore this email. This link is unique to ${safeInviteeEmail}.
                </p>
              </td>
            </tr>
          </table>
          <p style="margin:18px 0 0;font-size:12px;line-height:18px;color:#8a8a8a;">
            LivoCall - AI voice agents for Bangladeshi businesses
          </p>
        </td>
      </tr>
    </table>
  </body>
</html>`
}

function renderLogo(workspaceName: string, workspaceLogoUrl?: string | null) {
  const safeLogoUrl =
    workspaceLogoUrl && /^https?:\/\//i.test(workspaceLogoUrl) ? escapeHtml(workspaceLogoUrl) : ''
  const initials = escapeHtml(workspaceInitials(workspaceName))
  if (safeLogoUrl) {
    return `<img src="${safeLogoUrl}" width="56" height="56" alt="${escapeHtml(workspaceName)} logo" style="display:block;width:56px;height:56px;border-radius:14px;border:1px solid #e5e5e5;object-fit:cover;background:#ffffff;" />`
  }
  return `<div style="width:56px;height:56px;border-radius:14px;border:1px solid #e5e5e5;background:#171717;color:#ffffff;text-align:center;line-height:56px;font-size:18px;font-weight:800;">${initials}</div>`
}

function detailRow(label: string, value: string) {
  return `<tr>
    <td style="width:38%;padding:12px 14px;border-bottom:1px solid #eeeeec;background:#fbfbfa;color:#737373;font-size:12px;line-height:18px;">${escapeHtml(label)}</td>
    <td style="padding:12px 14px;border-bottom:1px solid #eeeeec;color:#171717;font-size:13px;line-height:18px;font-weight:650;">${value}</td>
  </tr>`
}

function formatRole(role: WorkspaceRole) {
  return role.slice(0, 1).toUpperCase() + role.slice(1)
}

function formatDate(value: Date) {
  return new Intl.DateTimeFormat('en', {
    dateStyle: 'medium',
    timeStyle: 'short',
  }).format(value)
}

function workspaceInitials(name: string) {
  const words = name.trim().split(/\s+/).filter(Boolean)
  const initials =
    words.length > 1
      ? `${words[0]?.[0] ?? ''}${words[1]?.[0] ?? ''}`
      : (words[0] ?? 'W').slice(0, 2)
  return initials.toUpperCase()
}

function escapeHtml(value: string) {
  return value.replace(/[&<>"']/g, (char) => {
    switch (char) {
      case '&':
        return '&amp;'
      case '<':
        return '&lt;'
      case '>':
        return '&gt;'
      case '"':
        return '&quot;'
      case "'":
        return '&#39;'
      default:
        return char
    }
  })
}
