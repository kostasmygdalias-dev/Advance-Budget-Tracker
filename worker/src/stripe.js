// Minimal Stripe integration using plain fetch + Web Crypto — no SDK
// dependency, to keep this Worker small and avoid Node-only APIs the SDK
// sometimes assumes. Two things live here: verifying that a webhook request
// genuinely came from Stripe, and making authenticated calls to Stripe's API.

async function hmacSha256(secret, message) {
  const enc = new TextEncoder();
  const key = await crypto.subtle.importKey('raw', enc.encode(secret), { name: 'HMAC', hash: 'SHA-256' }, false, ['sign']);
  return crypto.subtle.sign('HMAC', key, enc.encode(message)); // ArrayBuffer
}

function hexToBytes(hex) {
  if (typeof hex !== 'string' || hex.length % 2 !== 0) return null;
  const bytes = new Uint8Array(hex.length / 2);
  for (let i = 0; i < bytes.length; i++) {
    const byte = Number.parseInt(hex.slice(i * 2, i * 2 + 2), 16);
    if (Number.isNaN(byte)) return null;
    bytes[i] = byte;
  }
  return bytes;
}

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

  const providedBytes = hexToBytes(v1);
  if (!providedBytes) return null;

  const expected = await hmacSha256(secret, `${timestamp}.${rawBody}`);
  // Cloudflare Workers extends SubtleCrypto with timingSafeEqual — a
  // constant-time comparison isn't expressible as plain JS without risking
  // the JIT optimizing away the "constant" part, so this uses the runtime's
  // own implementation rather than hand-rolling one.
  if (!crypto.subtle.timingSafeEqual(expected, providedBytes)) return null;

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
