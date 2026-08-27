// Viber's REST API: sending messages and verifying that an incoming
// webhook request genuinely came from Viber. Same HMAC-signature shape as
// the Stripe webhook in stripe.js, using the bot's own auth token as the
// key (Viber doesn't issue a separate webhook signing secret).
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

export async function verifyViberSignature(rawBody, signature, authToken) {
  const providedBytes = hexToBytes(signature);
  if (!providedBytes) return false;
  const expected = await hmacSha256(authToken, rawBody);
  // Plain === on the hex strings would short-circuit on the first mismatched
  // character, leaking how many leading bytes were correct through response
  // timing — same reasoning as stripe.js's webhook check, and the same fix:
  // a constant-time comparison via the runtime's own implementation.
  if (expected.byteLength !== providedBytes.byteLength) return false;
  return crypto.subtle.timingSafeEqual(expected, providedBytes);
}

export async function sendViberMessage(env, receiverId, text) {
  const res = await fetch('https://chatapi.viber.com/pa/send_message', {
    method: 'POST',
    headers: { 'X-Viber-Auth-Token': env.VIBER_AUTH_TOKEN, 'Content-Type': 'application/json' },
    body: JSON.stringify({ receiver: receiverId, type: 'text', text, sender: { name: 'ExpenseTrack' } }),
  });
  if (!res.ok) throw new Error(`Viber send_message failed: ${res.status} ${await res.text()}`);
  return res.json();
}

// One-time setup call — see VIBER_SETUP.md. Not invoked automatically by
// this Worker; run once from a local script/curl after deploying.
export async function setViberWebhook(env, webhookUrl) {
  const res = await fetch('https://chatapi.viber.com/pa/set_webhook', {
    method: 'POST',
    headers: { 'X-Viber-Auth-Token': env.VIBER_AUTH_TOKEN, 'Content-Type': 'application/json' },
    body: JSON.stringify({ url: webhookUrl, event_types: ['message', 'conversation_started', 'subscribed'] }),
  });
  return res.json();
}
