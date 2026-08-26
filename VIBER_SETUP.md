# Setting up the Viber bot (Pro feature)

Lets a subscriber add/remove expenses and income, and ask for reports, by
chatting with a bot on Viber — no need to open the app. Enforced server-side
in the same billing Worker (`worker/`) that gates Recurring, same "fails
open until configured" philosophy: nothing changes until every secret below
is set.

**Read this first — it's a bigger step than the Recurring paywall.** To act
on your Sheet from a chat message with no browser open, the Worker has to
permanently store a Google **refresh token** per connected user — a
standing credential, not the short-lived access token the rest of the app
uses. That's a real, deliberate expansion of what this Worker holds. See
the comment at the top of `worker/src/googleOAuth.js` for the reasoning.
Assumes [BILLING_SETUP.md](BILLING_SETUP.md) is already done (Cloudflare +
Stripe + the Worker deployed) — this doc only covers what's new.

---

## Part A — Google Cloud: enable offline access

You already have an OAuth Client (from [DEPLOY.md](DEPLOY.md)) — this reuses
it, adding a second capability to it.

1. [console.cloud.google.com](https://console.cloud.google.com/) → **APIs &
   Services → Credentials** → open your existing OAuth 2.0 Client ID (Web
   application).
2. Under **Authorized redirect URIs**, add:
   ```
   <your Worker URL>/oauth/callback
   ```
   (the Worker URL from BILLING_SETUP.md Part A, e.g.
   `https://expensetrack-billing.<subdomain>.workers.dev/oauth/callback`)
3. Copy the **Client secret** shown on that same page — you'll need it in
   Part D. Keep it out of the repo entirely; it only ever goes into
   Cloudflare as a Worker secret.
4. **APIs & Services → OAuth consent screen → Audience**: if your app is
   still in "Testing" mode, every Google account that will use the Viber
   bot must be added as a test user, same as sign-in already requires.

---

## Part B — Viber: create the bot

1. Go to [partners.viber.com](https://partners.viber.com/) and sign in (or
   create an account) with the Viber app on your phone for verification.
2. **Create Bot Account** — give it a name and icon (this is what users see
   in Viber).
3. On the bot's admin page, find and copy its **Auth Token** — you'll need
   it in Part D.
4. Note the bot's public account name/URI shown there — that's what you'll
   tell users to search for in Viber to start a chat with it.

---

## Part C — Anthropic: get an API key

1. [console.anthropic.com](https://console.anthropic.com/) → sign in →
   **API Keys → Create Key**. Copy it — you'll need it in Part D.
2. This key is billed per message the bot processes (parsing "add 20 for
   coffee" into a structured action). Set a spending limit under
   **Settings → Limits** if you want a ceiling.

---

## Part D — Wire it together

1. Set the new Worker secrets (from `worker/`):
   ```bash
   npx wrangler secret put GOOGLE_CLIENT_SECRET
   # paste the Client secret from Part A step 3

   npx wrangler secret put VIBER_AUTH_TOKEN
   # paste the Auth Token from Part B step 3

   npx wrangler secret put ANTHROPIC_API_KEY
   # paste the API key from Part C step 1
   ```
2. Open `worker/wrangler.jsonc` and set `GOOGLE_CLIENT_ID` under `"vars"` to
   the same Client ID you use for `VITE_GOOGLE_CLIENT_ID` (it's not secret —
   already public in the deployed frontend — but the Worker needs its own
   copy for the token exchange call).
3. Commit and push (or re-run the **Deploy billing Worker** GitHub Action)
   so the Worker redeploys with the new vars/secrets.
4. Register the webhook with Viber — **one-time**, run from anywhere with
   curl (replace both placeholders):
   ```bash
   curl -X POST https://chatapi.viber.com/pa/set_webhook \
     -H "X-Viber-Auth-Token: <your bot auth token>" \
     -H "Content-Type: application/json" \
     -d '{"url": "<your Worker URL>/viber/webhook", "event_types": ["message","conversation_started","subscribed"]}'
   ```
   Double-check the URL is `<your Worker URL>/viber/webhook` (not
   `/oauth/callback`) before sending. A successful response looks like
   `{"status":0,"status_message":"ok",...}`.

Frontend-wise: nothing new to set. Settings.jsx reuses
`VITE_SUBSCRIPTION_API_URL` (already set per BILLING_SETUP.md) to build the
OAuth and webhook URLs above — no new env var.

---

## Test it

1. Visit the live site, sign in as a Pro subscriber, go to **Settings** —
   you should see a new "Add/remove expenses via Viber" card with a
   **Connect Viber** button.
2. Click it → Google's consent screen (this time asking for offline
   access) → approve → you land back on **Settings in the app itself**
   (not a separate page) showing a 6-character code and `/link CODE`.
3. Open Viber, find your bot (search the name from Part B), start a chat,
   send exactly what the page showed: `/link ABCDEF`.
4. The bot should reply confirming the connection. Try:
   - "add 12.50 for coffee"
   - "remove the last one"
   - "how much did I spend this month"
5. Back in the app, refresh Settings — it should show "Connected" with a
   Disconnect option instead of Connect.
6. Check the expense actually landed: open **Transactions** in the app, or
   the Google Sheet directly.

## Known limitations (by design, not bugs)

- **Link codes expire after 15 minutes.** If you don't get `/link CODE` sent
  in time, Settings shows a **"Get new link code"** button instead of
  Connect once the Google step is done — no need to repeat the consent
  screen.
- **One Viber account per Google account.** Connecting again overwrites the
  previous link.
- **"Remove" always targets the single most recent match** (most recent
  entry overall, or most recent matching your description hint) — it never
  asks "did you mean A or B?". If that's not the one you meant, add it back
  manually in the app.
- **Reports are text summaries**, not charts — total spent/income and a
  count, optionally scoped to one category. For visuals, use the Reports
  page in the app.
- If the bot ever seems stuck or wrong, disconnecting and reconnecting from
  Settings resets everything cleanly (this also **revokes** the stored
  Google credential with Google itself, not just forgets it locally).
