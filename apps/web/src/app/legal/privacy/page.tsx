export const metadata = { title: 'Privacy Policy · LivoCall' }

export default function PrivacyPage() {
  return (
    <main className="mx-auto max-w-3xl px-4 py-12 prose dark:prose-invert">
      <h1>Privacy Policy</h1>
      <p>
        Last updated: {new Date().toLocaleDateString('en-GB', { year: 'numeric', month: 'long', day: 'numeric' })}
      </p>
      <h2>Data we collect</h2>
      <ul>
        <li>Account data (name, email, workspace slug)</li>
        <li>Call metadata (caller/callee E.164 numbers, duration, outcome, cost)</li>
        <li>Call transcripts and AI-generated summaries (when recording is enabled)</li>
        <li>Call audio recordings (when recording is enabled and retained per your settings)</li>
        <li>Knowledge-base content you upload for retrieval</li>
        <li>Audit log of dashboard actions</li>
      </ul>
      <h2>How we use it</h2>
      <p>
        To deliver the voice-agent service, bill usage, and debug incidents on your behalf.
        We do not sell personal data. Access is restricted to employees who need it to
        operate the service, under a confidentiality agreement.
      </p>
      <h2>Retention</h2>
      <ul>
        <li>Call metadata and transcripts: 12 months by default (configurable per workspace)</li>
        <li>Audio recordings: 90 days by default</li>
        <li>Audit log: 24 months</li>
      </ul>
      <h2>Your rights</h2>
      <p>
        You can export or permanently delete workspace data at any time by contacting{' '}
        <a href="mailto:privacy@bd.voice">privacy@bd.voice</a>. We respond within 30 days.
      </p>
      <h2>BTRC and recording consent</h2>
      <p>
        Calls originated via LivoCall comply with Bangladesh Telecommunication Regulatory
        Commission (BTRC) guidelines, including the pre-call disclosure announcement
        when configured on your workspace.
      </p>
      <h2>Contact</h2>
      <p>
        <a href="mailto:privacy@bd.voice">privacy@bd.voice</a>
      </p>
    </main>
  )
}
