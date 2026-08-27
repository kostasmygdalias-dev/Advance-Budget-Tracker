import LegalPageLayout from '@/components/LegalPageLayout';

const SUPPORT_EMAIL = 'kostas_mygdalias@hotmail.com';

function H2({ children }) {
  return <h2 className="text-base font-heading font-semibold pt-2">{children}</h2>;
}

export default function Privacy() {
  return (
    <LegalPageLayout title="Privacy Policy" updated="27 August 2026">
      <p>
        ExpenseTrack ("the app," "we," "us") is a personal expense and income
        tracker. This page explains what data the app touches, where it's
        stored, and who else — if anyone — sees it. If anything here is
        unclear, email us at{' '}
        <a href={`mailto:${SUPPORT_EMAIL}`} className="underline">{SUPPORT_EMAIL}</a>.
      </p>

      <H2>The short version</H2>
      <p>
        Your expenses, income, categories, budgets, goals, and debts are
        stored in a spreadsheet in <strong>your own</strong> Google Drive —
        not on our servers, not in a shared database. We never see that data.
        The only things we hold about you are: your Google account ID and
        email (so you can sign in), and — only if you subscribe to Pro —
        your subscription status. Nothing is sold or shared with advertisers.
      </p>

      <H2>What we collect, and why</H2>
      <p><strong>To sign you in:</strong> when you "Continue with Google," Google
      shares your account ID, name, email, and profile picture with the app.
      We use this only to identify you and to personalize what's on screen —
      never to contact you outside the app, and never to build an advertising
      profile.</p>
      <p><strong>Your financial data:</strong> every expense, income entry,
      category, budget, savings goal, and debt you record is written directly
      from your browser into a Google Sheet named "ExpenseTrack Data" in your
      own Google Drive, using an access token your browser holds for the
      length of your session. This data never passes through, or is copied
      onto, any server we operate.</p>
      <p><strong>Payment (Pro subscribers only):</strong> if you upgrade to
      Pro, payment is handled entirely by Stripe. We never see or store your
      card number — only a Stripe customer ID and your subscription status
      (active/canceled), kept in a small server-side store (Cloudflare
      Workers KV) linked to your Google account ID, so the app can check
      "is this account currently paying" without trusting anything the
      browser says.</p>
      <p><strong>Viber bot (Pro feature, only if you connect it):</strong> to
      let a chat message add or remove expenses without the app open, we
      store a Google refresh token for your account (a standing credential,
      not the short-lived one the browser uses) and a mapping between your
      Viber account and your Google account, in that same server-side store.
      Chat messages you send the bot are sent to Anthropic's Claude API
      solely to interpret what you're asking for (e.g. "add 12 for coffee")
      — Anthropic does not use this to train its models under our agreement
      with them. Disconnecting Viber from Settings deletes this data and
      revokes the credential with Google itself, not just locally.</p>

      <H2>Cookies and local storage</H2>
      <p>We don't use tracking or advertising cookies. The app stores a
      handful of small values in your browser only:</p>
      <ul className="list-disc pl-5 space-y-1">
        <li>Your Google sign-in access token, for the length of your browser
        tab session only (cleared when you close it)</li>
        <li>Your last-used email, so the sign-in button can hint at it</li>
        <li>Language and light/dark theme preference</li>
        <li>A couple of small flags so budget-exceeded notices and
        automatic backup reminders don't repeat every time you open the app</li>
      </ul>
      <p>None of this is sent to us — it stays in your browser.</p>

      <H2>Who else sees your data</H2>
      <p>Only the services strictly needed to run the app, and only what's
      described above:</p>
      <ul className="list-disc pl-5 space-y-1">
        <li><strong>Google</strong> — sign-in, and hosts your actual data
        (their own privacy policy governs your Drive/Sheets data itself)</li>
        <li><strong>Stripe</strong> — payment processing, for Pro subscribers</li>
        <li><strong>Cloudflare</strong> — runs the small server component
        that checks subscription status and (if you use it) the Viber bot</li>
        <li><strong>Viber (Rakuten Viber)</strong> and <strong>Anthropic</strong>
        — only if you actively connect and use the Viber bot feature</li>
      </ul>
      <p>We don't sell data, and we don't share it with anyone else.</p>

      <H2>Your data, your control</H2>
      <p>Because your financial data lives in your own Google Drive, you
      already have full, direct control over it — delete the "ExpenseTrack
      Data" spreadsheet at any time and it's gone, no request to us needed.
      To fully disconnect the app from your Google account, revoke its
      access at{' '}
      <a href="https://myaccount.google.com/permissions" target="_blank" rel="noreferrer" className="underline">
        myaccount.google.com/permissions
      </a>. To remove the subscription/Viber records we hold server-side,
      or for anything else about your data, email{' '}
      <a href={`mailto:${SUPPORT_EMAIL}`} className="underline">{SUPPORT_EMAIL}</a> and
      we'll action it within a reasonable time.</p>

      <H2>Security</H2>
      <p>Data in transit is encrypted (HTTPS). Our server-side webhook and
      credential handling uses constant-time signature checks to resist
      tampering. No method of transmission or storage is 100% secure, but we
      take reasonable, industry-standard steps appropriate for the limited
      data we actually hold.</p>

      <H2>Children</H2>
      <p>ExpenseTrack isn't directed at children under 16, and we don't
      knowingly collect data from them.</p>

      <H2>Changes to this policy</H2>
      <p>If this policy changes materially, we'll update the date at the top
      of this page. Continued use of the app after a change means you accept
      the updated policy.</p>

      <H2>Contact</H2>
      <p>Questions, requests, or concerns about your data:{' '}
      <a href={`mailto:${SUPPORT_EMAIL}`} className="underline">{SUPPORT_EMAIL}</a>.</p>
    </LegalPageLayout>
  );
}
