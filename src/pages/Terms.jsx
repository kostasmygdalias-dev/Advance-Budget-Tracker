import LegalPageLayout from '@/components/LegalPageLayout';

const SUPPORT_EMAIL = 'kostas_mygdalias@hotmail.com';

function H2({ children }) {
  return <h2 className="text-base font-heading font-semibold pt-2">{children}</h2>;
}

export default function Terms() {
  return (
    <LegalPageLayout title="Terms of Service" updated="27 August 2026">
      <p>
        These terms cover your use of ExpenseTrack ("the app," "we," "us").
        By signing in, you agree to them. If you don't agree, please don't
        use the app.
      </p>

      <H2>What the app is</H2>
      <p>ExpenseTrack is a personal expense and income tracker. Sign-in is
      via Google, and every user's financial data is stored in their own
      Google Drive rather than a shared database we control — see the{' '}
      <a href="#/privacy" className="underline">Privacy Policy</a> for the
      full detail of what we do and don't hold.</p>

      <H2>Your account</H2>
      <p>You need a Google account to use the app. You're responsible for
      keeping that account secure — anyone with access to it has access to
      the data stored in your Sheet. Use the app only for its intended
      purpose and only with information you're entitled to record.</p>

      <H2>Your data</H2>
      <p>You own the financial data you record. Because it lives in your own
      Google Drive, you can export, back up, or delete it at any time,
      independent of us — see Settings' backup/export tools, or open the
      spreadsheet directly in Google Sheets.</p>

      <H2>Pro subscription</H2>
      <p>Some features (recurring templates, the Viber bot, upcoming-charge
      reminders) require an active Pro subscription, billed through Stripe.
      You can cancel anytime from Settings → Manage subscription; access to
      Pro features continues until the end of the billing period you've
      already paid for. Fees already charged for a completed billing period
      are non-refundable except where required by law.</p>

      <H2>Acceptable use</H2>
      <p>Don't use the app to break the law, attempt to disrupt or gain
      unauthorized access to it or other users' data, or interfere with
      other users. We may suspend or terminate access for accounts that do.</p>

      <H2>Service availability</H2>
      <p>The app is provided "as is," without warranty of any kind, express
      or implied. We aim for the app to be reliable, but don't guarantee
      uninterrupted or error-free operation, and aren't liable for data loss
      — since your data lives in your own Google Drive, Google's own tools
      (including Sheets' built-in version history) are your primary
      safeguard, alongside the app's own optional backup feature.</p>

      <H2>Limitation of liability</H2>
      <p>To the maximum extent permitted by law, we aren't liable for any
      indirect, incidental, or consequential damages arising from your use
      of the app. Our total liability for any claim relating to the app is
      limited to the amount you paid us, if any, in the 12 months before
      the claim.</p>

      <H2>Changes</H2>
      <p>We may update these terms as the app changes. Material changes will
      update the date at the top of this page; continued use after a change
      means you accept the updated terms.</p>

      <H2>Governing law</H2>
      <p>These terms are governed by the laws of Greece, without regard to
      conflict-of-law principles, without prejudice to any mandatory
      consumer-protection rights you have under the law of your own country
      of residence if you're an EU consumer.</p>

      <H2>Contact</H2>
      <p>Questions about these terms:{' '}
      <a href={`mailto:${SUPPORT_EMAIL}`} className="underline">{SUPPORT_EMAIL}</a>.</p>
    </LegalPageLayout>
  );
}
