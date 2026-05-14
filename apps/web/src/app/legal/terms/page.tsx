export const metadata = { title: 'Terms of Service · LivoCall' }

export default function TermsPage() {
  return (
    <main className="mx-auto max-w-3xl px-4 py-12 prose dark:prose-invert">
      <h1>Terms of Service</h1>
      <p>
        Last updated: {new Date().toLocaleDateString('en-GB', { year: 'numeric', month: 'long', day: 'numeric' })}
      </p>
      <p>
        By creating a workspace on LivoCall you agree to these terms. Your use of the
        service is governed by Bangladesh law; disputes are subject to the courts of
        Dhaka.
      </p>
      <h2>Service</h2>
      <p>
        LivoCall provides AI-powered voice-call infrastructure. Uptime target is 99.5%.
        Billing is prepaid in BDT paisa; you may top up via PayStation hosted checkout.
      </p>
      <h2>Acceptable use</h2>
      <p>
        See our <a href="/legal/aup">Acceptable Use Policy</a>. Violations may result in
        immediate suspension, including for unsolicited bulk calls, fraud, harassment,
        or violation of BTRC regulations.
      </p>
      <h2>Data ownership</h2>
      <p>
        You retain ownership of content you upload (knowledge bases, prompts, transcripts).
        You grant LivoCall a license to process and store it solely to provide the service.
      </p>
      <h2>Liability</h2>
      <p>
        Our total liability in any 12-month period is limited to the amount you paid
        during that period. We are not liable for indirect, incidental, or consequential damages.
      </p>
      <h2>Termination</h2>
      <p>
        You may close your workspace at any time from Settings. We may suspend or
        terminate for non-payment, fraud, or policy violations with reasonable notice
        where feasible.
      </p>
      <h2>Contact</h2>
      <p>
        <a href="mailto:legal@bd.voice">legal@bd.voice</a>
      </p>
    </main>
  )
}
