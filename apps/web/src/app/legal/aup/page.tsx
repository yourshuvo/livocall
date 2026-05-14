export const metadata = { title: 'Acceptable Use Policy · LivoCall' }

export default function AUPPage() {
  return (
    <main className="mx-auto max-w-3xl px-4 py-12 prose dark:prose-invert">
      <h1>Acceptable Use Policy</h1>
      <p>
        LivoCall is a business communications platform. You may not use it to:
      </p>
      <ul>
        <li>Send unsolicited bulk calls to numbers without prior consent</li>
        <li>Impersonate government officials, banks, or other third parties</li>
        <li>Commit fraud, phishing, or scams of any kind</li>
        <li>Harass, threaten, or stalk any individual</li>
        <li>Violate BTRC regulations, including required disclosure announcements</li>
        <li>Bypass DNC (do-not-call) lists or user opt-outs</li>
        <li>Call emergency services (999) or premium-rate destinations</li>
        <li>Violate any applicable law or third-party rights</li>
      </ul>
      <p>
        We monitor aggregate metrics (call-completion ratio, abuse reports, destination
        distribution) and reserve the right to suspend any workspace showing signs of
        abuse, pending investigation.
      </p>
      <p>
        Report abuse to <a href="mailto:abuse@bd.voice">abuse@bd.voice</a>.
      </p>
    </main>
  )
}
