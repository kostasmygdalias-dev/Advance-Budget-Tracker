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
  const allowedOrigins = (env.ALLOWED_ORIGINS || '').split(',').map((s) => s.trim()).filter(Boolean);
  const returnUrl = body.returnUrl || allowedOrigins[0] || '';

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

function htmlPage(bodyHtml) {
  return new Response(
    `<!doctype html><html><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1">
    <title>ExpenseTrack</title>
    <style>body{font:16px/1.5 -apple-system,system-ui,sans-serif;max-width:480px;margin:15vh auto;padding:0 24px;text-align:center;color:#0f172a}
    code{background:#f1f5f9;padding:4px 10px;border-radius:6px;display:inline-block;margin:8px 0}</style>
    </head><body>${bodyHtml}</body></html>`,
    { headers: { 'Content-Type': 'text/html; charset=utf-8' } },
  );
}

// Google redirects the browser here after the user approves offline access
// (see the "Connect Viber" button in Settings.jsx). This is the one place
// a refresh token is minted and stored — see googleOAuth.js's header
// comment for why the Viber bot needs one at all.
async function handleOAuthCallback(request, env) {
  const url = new URL(request.url);
  const err = url.searchParams.get('error');
  if (err) return htmlPage(`<h2>Connection cancelled</h2><p>(${err}) You can close this tab and try again from Settings.</p>`);

  const code = url.searchParams.get('code');
  if (!code) return htmlPage('<h2>Missing authorization code</h2><p>Close this tab and try again from Settings.</p>');

  let tokens;
  try {
    tokens = await exchangeCodeForTokens(env, code, `${url.origin}/oauth/callback`);
  } catch (e) {
    return htmlPage(`<h2>Could not complete the connection</h2><p>${e.message}</p>`);
  }
  if (!tokens.refresh_token) {
    return htmlPage(
      "<h2>Almost there</h2><p>Google didn't grant offline access this time — this usually happens if you've connected before. "
      + "Open your Google Account's <strong>Third-party apps &amp; services</strong> page, remove ExpenseTrack's access, then try Connect Viber again.</p>",
    );
  }

  const user = await fetchGoogleUserInfo(tokens.access_token);
  if (!user.sub) return htmlPage('<h2>Could not identify your Google account</h2><p>Close this tab and try again.</p>');

  const subscription = await getSubscription(env, user.sub);
  if (subscription?.status !== 'active') {
    return htmlPage('<h2>Pro feature</h2><p>The Viber bot requires an active subscription — upgrade in the app, then try Connect Viber again.</p>');
  }

  await setRefreshToken(env, user.sub, tokens.refresh_token);
  const linkCode = await createLinkCode(env, user.sub);
  return htmlPage(
    `<h2>Connected!</h2><p>Open Viber, find the ExpenseTrack bot, and send:</p><code>/link ${linkCode}</code><p>This code expires in 15 minutes.</p>`,
  );
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
  const viberUserId = await getViberUserForSub(env, user.sub);
  return json({ connected: !!viberUserId }, 200, cors);
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
      if (url.pathname === '/viber/unlink' && request.method === 'POST') {
        return await handleViberUnlink(request, env, cors);
      }
      return json({ error: 'Not found' }, 404, cors);
    } catch (err) {
      return json({ error: err.message || 'Internal error' }, 500, cors);
    }
  },
};
