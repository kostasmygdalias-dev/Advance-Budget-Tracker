// ExpenseTrack billing Worker — the one piece of backend this otherwise
// fully static, backend-less app has, and it exists for exactly one reason:
// a subscription gate enforced only in browser JS can be bypassed by
// anyone with dev tools open. This Worker is the source of truth for "is
// this Google account currently paying," checked server-side on every
// request. It never sees expense/income data — only a Google account id
// (`sub`) and Stripe subscription status.
import { verifyGoogleUser } from './google.js';
import { verifyStripeWebhook, stripeRequest } from './stripe.js';
import { getSubscription, setSubscription, linkCustomerToSub, getSubForCustomer } from './kv.js';

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
      return json({ error: 'Not found' }, 404, cors);
    } catch (err) {
      return json({ error: err.message || 'Internal error' }, 500, cors);
    }
  },
};
