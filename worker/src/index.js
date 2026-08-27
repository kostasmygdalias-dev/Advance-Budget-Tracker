// ExpenseTrack billing Worker — the one piece of backend this otherwise
// fully static, backend-less app has, and it exists for exactly one reason:
// a subscription gate enforced only in browser JS can be bypassed by
// anyone with dev tools open. This Worker is the source of truth for "is
// this Google account currently paying," checked server-side on every
// request. It never sees expense/income data — only a Google account id
// (`sub`) and Stripe subscription status.
import { verifyGoogleUser } from './google.js';
import { verifyStripeWebhook, stripeRequest } from './stripe.js';
import {
  getSubscription, setSubscription, linkCustomerToSub, getSubForCustomer,
  setRefreshToken, getRefreshToken, deleteRefreshToken, createLinkCode, getViberUserForSub, unlinkViberUser,
} from './kv.js';
import { exchangeCodeForTokens, fetchGoogleUserInfo, revokeRefreshToken } from './googleOAuth.js';
import { verifyViberSignature } from './viber.js';
import { handleViberMessage } from './viberBot.js';

function corsHeaders(request, env) {
  const origin = request.headers.get('Origin');
  const allowed = (env.ALLOWED_ORIGINS || '').split(',').map((s) => s.trim()).filter(Boolean);
  const headers = {
    'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
    'Access-Control-Allow-Headers': 'Authorization, Content-Type',
    'Access-Control-Max-Age': '86400',
  };
  if (origin && allowed.includes(origin)) {
    headers['Access-Control-Allow-Origin'] = origin;
    headers.Vary = 'Origin';
  }
  return headers;
}

function json(data, status, cors) {
  return new Response(JSON.stringify(data), {
    status,
    headers: { 'Content-Type': 'application/json', ...cors },
  });
}

async function handleStatus(request, env, cors) {
  const user = await verifyGoogleUser(request);
  if (!user) return json({ error: 'Unauthorized' }, 401, cors);
  const sub = await getSubscription(env, user.sub);
  return json({ active: sub?.status === 'active', status: sub?.status || 'none' }, 200, cors);
}

async function handlePortalSession(request, env, cors) {
  const user = await verifyGoogleUser(request);
  if (!user) return json({ error: 'Unauthorized' }, 401, cors);
  const sub = await getSubscription(env, user.sub);
  if (!sub?.stripeCustomerId) return json({ error: 'No subscription found for this account' }, 400, cors);

  const body = await request.json().catch(() => ({}));
  // Caller-supplied like `state` on the OAuth callback below — only ever
  // honor it if it actually points back at a configured origin, or this
  // becomes an open redirect off the end of a real Stripe checkout.
  const returnUrl = isAllowedReturnUrl(env, body.returnUrl) ? body.returnUrl : (allowedOriginsList(env)[0] || '');

  const session = await stripeRequest(env, 'billing_portal/sessions', {
    customer: sub.stripeCustomerId,
    return_url: returnUrl,
  });
  return json({ url: session.url }, 200, cors);
}

async function handleWebhook(request, env, cors) {
  const rawBody = await request.text();
  const sig = request.headers.get('Stripe-Signature');
  const event = await verifyStripeWebhook(rawBody, sig, env.STRIPE_WEBHOOK_SECRET);
  if (!event) return json({ error: 'Invalid signature' }, 400, cors);

  if (event.type === 'checkout.session.completed') {
    const session = event.data.object;
    const googleSub = session.client_reference_id;
    if (googleSub && session.customer) {
      await setSubscription(env, googleSub, {
        status: 'active',
        stripeCustomerId: session.customer,
        stripeSubscriptionId: session.subscription || null,
        currentPeriodEnd: null,
        updatedAt: new Date().toISOString(),
      });
      await linkCustomerToSub(env, session.customer, googleSub);
    }
  } else if (event.type === 'customer.subscription.updated' || event.type === 'customer.subscription.deleted') {
    const subscription = event.data.object;
    const googleSub = await getSubForCustomer(env, subscription.customer);
    if (googleSub) {
      const existing = await getSubscription(env, googleSub);
      const status = event.type === 'customer.subscription.deleted' ? 'canceled' : subscription.status;
      await setSubscription(env, googleSub, {
        ...existing,
        status,
        stripeCustomerId: subscription.customer,
        stripeSubscriptionId: subscription.id,
        currentPeriodEnd: subscription.current_period_end || null,
        updatedAt: new Date().toISOString(),
      });
    }
  }
  // Other event types are intentionally ignored.

  return json({ received: true }, 200, cors);
}

function allowedOriginsList(env) {
  return (env.ALLOWED_ORIGINS || '').split(',').map((s) => s.trim()).filter(Boolean);
}

// Unlike `state` below (a bare origin), this checks a full URL — Settings.jsx
// sends back `${origin}/#/settings` — so it must match as a prefix, not
// exact equality, while still rejecting anything not actually rooted at a
// configured origin.
function isAllowedReturnUrl(env, url) {
  if (!url) return false;
  return allowedOriginsList(env).some((origin) => url === origin || url.startsWith(`${origin}/`) || url.startsWith(`${origin}#`));
}

// `state` round-trips through Google unmodified, so it's attacker-influenceable
// (a crafted initial link could set it) — only ever redirect to a value that
// exactly matches a configured origin, never to `state` verbatim, or this
// becomes an open redirect immediately after a real Google auth.
function resolveReturnOrigin(env, state) {
  const allowed = allowedOriginsList(env);
  return allowed.includes(state) ? state : (allowed[0] || '');
}

function redirectTo(url) {
  return new Response(null, { status: 302, headers: { Location: url } });
}

// Google redirects the browser here after the user approves offline access
// (see startViberConnect() in subscription.js). This is the one place a
// refresh token is minted and stored — see googleOAuth.js's header comment
// for why the Viber bot needs one at all. Always ends by redirecting back
// into the app's Settings page (not a page hosted on this Worker) — either
// with ?viber_link=CODE on success or ?viber_error=... on failure, so the
// app can render the outcome in its own UI instead of a bare Worker page.
async function handleOAuthCallback(request, env) {
  const url = new URL(request.url);
  const returnOrigin = resolveReturnOrigin(env, url.searchParams.get('state'));
  const back = (params) => redirectTo(`${returnOrigin}/#/settings?${new URLSearchParams(params).toString()}`);

  const err = url.searchParams.get('error');
  if (err) return back({ viber_error: 'cancelled' });

  const code = url.searchParams.get('code');
  if (!code) return back({ viber_error: 'missing_code' });

  let tokens;
  try {
    tokens = await exchangeCodeForTokens(env, code, `${url.origin}/oauth/callback`);
  } catch {
    return back({ viber_error: 'exchange_failed' });
  }
  if (!tokens.refresh_token) {
    // Usually means they'd already granted offline access before, and
    // Google only issues a refresh token on first consent (or with
    // prompt=consent forcing re-consent) — see startViberConnect().
    return back({ viber_error: 'no_refresh_token' });
  }

  const user = await fetchGoogleUserInfo(tokens.access_token);
  if (!user.sub) return back({ viber_error: 'no_identity' });

  const subscription = await getSubscription(env, user.sub);
  if (subscription?.status !== 'active') return back({ viber_error: 'not_pro' });

  await setRefreshToken(env, user.sub, tokens.refresh_token);
  const linkCode = await createLinkCode(env, user.sub);
  return back({ viber_link: linkCode });
}

// A link code is only good for 15 minutes; this mints a fresh one for an
// account that already completed the Google OAuth step (has a stored
// refresh token) without making them click through Google's consent screen
// again just because they didn't paste the code into Viber in time.
async function handleViberRelink(request, env, cors) {
  const user = await verifyGoogleUser(request);
  if (!user) return json({ error: 'Unauthorized' }, 401, cors);
  const subscription = await getSubscription(env, user.sub);
  if (subscription?.status !== 'active') return json({ error: 'Pro subscription required' }, 403, cors);
  const refreshToken = await getRefreshToken(env, user.sub);
  if (!refreshToken) return json({ error: 'not_connected' }, 400, cors);
  const linkCode = await createLinkCode(env, user.sub);
  return json({ code: linkCode }, 200, cors);
}

// Viber POSTs every bot event here. Must respond quickly — actual work is
// awaited inline since Workers don't have a fire-and-forget primitive
// outside waitUntil, and we want errors to surface in the response anyway.
async function handleViberWebhook(request, env, cors) {
  const rawBody = await request.text();
  const signature = request.headers.get('X-Viber-Content-Signature');
  const valid = await verifyViberSignature(rawBody, signature, env.VIBER_AUTH_TOKEN);
  if (!valid) return json({ error: 'Invalid signature' }, 401, cors);

  const event = JSON.parse(rawBody);
  if (event.event === 'message' && event.sender?.id && event.message?.text) {
    await handleViberMessage(env, { viberUserId: event.sender.id, text: event.message.text });
  }
  return json({ status: 0, status_message: 'ok' }, 200, cors);
}

async function handleViberStatus(request, env, cors) {
  const user = await verifyGoogleUser(request);
  if (!user) return json({ error: 'Unauthorized' }, 401, cors);
  const [viberUserId, refreshToken] = await Promise.all([
    getViberUserForSub(env, user.sub),
    getRefreshToken(env, user.sub),
  ]);
  // hasGoogleAuth without connected means the OAuth step is done but the
  // "/link CODE" message to the bot never completed (or the code expired)
  // — Settings.jsx offers "get a new code" instead of "connect" in that case.
  return json({ connected: !!viberUserId, hasGoogleAuth: !!refreshToken }, 200, cors);
}

async function handleViberUnlink(request, env, cors) {
  const user = await verifyGoogleUser(request);
  if (!user) return json({ error: 'Unauthorized' }, 401, cors);
  const refreshToken = await getRefreshToken(env, user.sub);
  if (refreshToken) await revokeRefreshToken(refreshToken);
  await deleteRefreshToken(env, user.sub);
  await unlinkViberUser(env, user.sub);
  return json({ ok: true }, 200, cors);
}

export default {
  async fetch(request, env) {
    const url = new URL(request.url);
    const cors = corsHeaders(request, env);

    if (request.method === 'OPTIONS') {
      return new Response(null, { status: 204, headers: cors });
    }

    try {
      if (url.pathname === '/subscription-status' && request.method === 'GET') {
        return await handleStatus(request, env, cors);
      }
      if (url.pathname === '/create-portal-session' && request.method === 'POST') {
        return await handlePortalSession(request, env, cors);
      }
      if (url.pathname === '/stripe-webhook' && request.method === 'POST') {
        return await handleWebhook(request, env, cors);
      }
      if (url.pathname === '/oauth/callback' && request.method === 'GET') {
        return await handleOAuthCallback(request, env);
      }
      if (url.pathname === '/viber/webhook' && request.method === 'POST') {
        return await handleViberWebhook(request, env, cors);
      }
      if (url.pathname === '/viber/status' && request.method === 'GET') {
        return await handleViberStatus(request, env, cors);
      }
      if (url.pathname === '/viber/relink' && request.method === 'POST') {
        return await handleViberRelink(request, env, cors);
      }
      if (url.pathname === '/viber/unlink' && request.method === 'POST') {
        return await handleViberUnlink(request, env, cors);
      }
      return json({ error: 'Not found' }, 404, cors);
    } catch (err) {
      // Every intentional client-facing error is already returned directly
      // by its handler above (wrong status, clear message) — anything that
      // lands here is unexpected, and its message may echo raw text from
      // Stripe/Google/Viber's own API responses. Log the real detail
      // server-side (visible via `wrangler tail`) and keep the client
      // response generic rather than forwarding whatever it says verbatim.
      console.error('Unhandled Worker error:', err);
      return json({ error: 'Internal error' }, 500, cors);
    }
  },
};
