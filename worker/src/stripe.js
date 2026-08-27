// Minimal Stripe integration using plain fetch + Web Crypto — no SDK
// dependency, to keep this Worker small and avoid Node-only APIs the SDK
// sometimes assumes. Two things live here: verifying that a webhook request
// genuinely came from Stripe, and making authenticated calls to Stripe's API.
import { verifyHmacHex } from './crypto.js';

// Verifies the `Stripe-Signature` header per Stripe's documented scheme
// (https://docs.stripe.com/webhooks#verify-manually) and returns the parsed
// event on success, or null if the signature is missing/invalid/stale.
// Note: only checks a single `v1=` value — fine unless the webhook signing
// secret is mid-rotation, in which case Stripe sends two v1 signatures.
export async function verifyStripeWebhook(rawBody, sigHeader, secret, toleranceSeconds = 300) {
  if (!sigHeader || !secret) return null;
  const parts = Object.fromEntries(sigHeader.split(',').map((p) => p.split('=')));
  const { t: timestamp, v1 } = parts;
  if (!timestamp || !v1) return null;

  const age = Math.abs(Date.now() / 1000 - Number(timestamp));
  if (!Number.isFinite(age) || age > toleranceSeconds) return null;

  if (!(await verifyHmacHex(secret, `${timestamp}.${rawBody}`, v1))) return null;

  return JSON.parse(rawBody);
}

// Authenticated POST to the Stripe API (form-encoded, as the Stripe API
// expects — not JSON) using Basic auth with the secret key.
export async function stripeRequest(env, path, params) {
  const res = await fetch(`https://api.stripe.com/v1/${path}`, {
    method: 'POST',
    headers: {
      Authorization: `Basic ${btoa(`${env.STRIPE_SECRET_KEY}:`)}`,
      'Content-Type': 'application/x-www-form-urlencoded',
    },
    body: new URLSearchParams(params).toString(),
  });
  if (!res.ok) {
    throw new Error(`Stripe API error ${res.status}: ${await res.text()}`);
  }
  return res.json();
}
