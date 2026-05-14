/**
 * Minimal mailer abstraction. In production, set MAIL_WEBHOOK_URL to a
 * receiving endpoint (e.g. a Postmark / SendGrid webhook proxy or your own
 * service). If unset, messages are logged to stderr — safe for local dev and
 * preview environments.
 *
 * We deliberately avoid pulling in nodemailer to keep the serverless bundle
 * small; swap this for your own provider by setting MAIL_WEBHOOK_URL.
 */

export interface MailMessage {
  to: string
  subject: string
  text: string
  html?: string
}

export async function sendMail(msg: MailMessage): Promise<void> {
  const webhook = process.env.MAIL_WEBHOOK_URL
  if (!webhook) {
    // eslint-disable-next-line no-console
    console.log(
      `[mailer:dev] To=${msg.to}\n  Subject: ${msg.subject}\n  ${msg.text.replace(/\n/g, '\n  ')}`,
    )
    return
  }
  await fetch(webhook, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({
      to: msg.to,
      subject: msg.subject,
      text: msg.text,
      html: msg.html,
    }),
  }).catch((e) => {
    // eslint-disable-next-line no-console
    console.warn(`[mailer] failed to POST ${webhook}:`, (e as Error).message)
  })
}

export function appBaseUrl(): string {
  return (
    process.env.APP_BASE_URL ||
    process.env.NEXT_PUBLIC_APP_BASE_URL ||
    'http://localhost:3000'
  ).replace(/\/$/, '')
}
