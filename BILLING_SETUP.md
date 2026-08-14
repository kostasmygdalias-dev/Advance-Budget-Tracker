# Setting up Recurring as a paid feature

This turns on the Free/Pro split: everyone gets Dashboard, Expenses, Income,
Categories, and Settings; **Recurring templates require an active
subscription**. Enforcement happens server-side (in a small Cloudflare
Worker under `worker/`), not in the browser — so it can't be bypassed by
editing localStorage or the deployed JS.

**Nothing in the app changes until you finish this whole doc.** Both new
env vars (`VITE_SUBSCRIPTION_API_URL`, `VITE_STRIPE_PAYMENT_LINK`) default
to unset, and unset means "billing not configured" — Recurring stays free
for everyone, exactly like today, until both are wired up.

Two accounts only you can create (identity/business verification, bank
details): **Cloudflare** (free tier is enough) and **Stripe**.

---

## Part A — Cloudflare

1. Create a free account at [dash.cloudflare.com/sign-up](https://dash.cloudflare.com/sign-up) if you don't have one.
2. From the project root:
   ```bash
   cd worker
   npx wrangler login
   ```
   This opens a browser tab to authorize the CLI.
3. Create the KV namespace that stores subscription status:
   ```bash
   npx wrangler kv namespace create SUBSCRIPTIONS
   ```
   It prints something like `id = "abcd1234..."`. Open `worker/wrangler.toml`
   and replace `REPLACE_WITH_KV_NAMESPACE_ID` with that id.
4. Get your Account ID: `npx wrangler whoami` prints it, or it's in the
   Cloudflare dashboard sidebar on any domain/Workers page.
5. Create an API token for GitHub Actions to deploy with: Cloudflare
   dashboard → **My Profile → API Tokens → Create Token** → use the
   **"Edit Cloudflare Workers"** template → scope it to your account →
   Create Token → copy it (shown once).
6. In the GitHub repo → **Settings → Secrets and variables → Actions**,
   add:
   - `CLOUDFLARE_API_TOKEN` — the token from step 5
   - `CLOUDFLARE_ACCOUNT_ID` — the account ID from step 4
7. Commit the `wrangler.toml` change from step 3 and push. The
   **Deploy billing Worker** GitHub Action will run and deploy it. Find the
   deployed URL either in that workflow's log output, or run:
   ```bash
   npx wrangler deployments list
   ```
   It looks like `https://expensetrack-billing.<your-subdomain>.workers.dev`.
   **Save this URL** — it's `VITE_SUBSCRIPTION_API_URL` in Part C.

---

## Part B — Stripe

1. Create an account at [dashboard.stripe.com/register](https://dashboard.stripe.com/register).
2. Start in **test mode** (toggle in the dashboard) so you can run through
   the whole flow with fake cards before touching real money.
3. **Products → Add product**: name it (e.g. "ExpenseTrack Pro"), add a
   recurring price (monthly or yearly, whatever you want to charge). Save.
4. **Payment links → New**: pick that product/price → Create link. Copy the
   URL (`https://buy.stripe.com/...`). **Save this** — it's
   `VITE_STRIPE_PAYMENT_LINK` in Part C.
5. **Developers → API keys**: copy the **Secret key** (`sk_test_...` for
   now). You'll paste this into Cloudflare in Part C — never into `.env` or
   anywhere in the repo.
6. **Developers → Webhooks → Add endpoint**:
   - Endpoint URL: `<your Worker URL from Part A>/stripe-webhook`
   - Events to send: `checkout.session.completed`,
     `customer.subscription.updated`, `customer.subscription.deleted`
   - Save, then copy the **Signing secret** (`whsec_...`).
7. **Settings → Billing → Customer portal**: open it once and save the
   default configuration — Stripe requires this to exist before the
   "Manage subscription" button (in the app's Settings page) will work.

---

## Part C — Wire it together

1. Give the Worker its Stripe secrets (these are set once, directly on
   Cloudflare — never committed to the repo):
   ```bash
   cd worker
   npx wrangler secret put STRIPE_SECRET_KEY
   # paste the sk_test_... value from Part B step 5, press enter

   npx wrangler secret put STRIPE_WEBHOOK_SECRET
   # paste the whsec_... value from Part B step 6, press enter
   ```
2. In the GitHub repo → **Settings → Secrets and variables → Actions**, add:
   - `VITE_SUBSCRIPTION_API_URL` — the Worker URL from Part A step 7
   - `VITE_STRIPE_PAYMENT_LINK` — the Payment Link from Part B step 4
3. Push any commit (or re-run the **Deploy to cretaforce.gr** workflow from
   the Actions tab) so the frontend rebuilds with billing turned on.

---

## Test it (still in Stripe test mode)

1. Visit the live site, sign in, go to **Recurring** — you should now see
   the "Recurring is a Pro feature" upgrade screen.
2. Click **Upgrade to Pro**, complete checkout with a
   [Stripe test card](https://docs.stripe.com/testing#cards) (e.g.
   `4242 4242 4242 4242`, any future expiry, any CVC).
3. Back in the app, Recurring should unlock. If it doesn't immediately,
   refresh — the status check runs on page load.
4. In **Settings**, you should see "Pro plan" with a **Manage
   subscription** button that opens Stripe's Customer Portal.
5. To double check the webhook actually fired, in `worker/` run:
   ```bash
   npx wrangler kv key get --binding=SUBSCRIPTIONS "sub:<your-google-sub>"
   ```
   (Your Google `sub` is visible in the app — e.g. log
   `JSON.stringify(user)` from `AuthContext` briefly, or check the Network
   tab's call to `/subscription-status`.) It should show
   `"status":"active"`.

## Go live

Once test mode works end-to-end: in Stripe, switch off test mode, repeat
Part B steps 3–6 in **live mode** (products/prices/payment links/webhook
are separate between test and live), and repeat Part C with the live
`sk_live_...` secret key, its webhook secret, and the live Payment Link
URL. Real charges only happen once you've done this live-mode swap.
