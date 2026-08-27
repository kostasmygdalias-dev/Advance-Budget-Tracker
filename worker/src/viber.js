// Viber's REST API: sending messages and verifying that an incoming
// webhook request genuinely came from Viber. Same HMAC-signature shape as
// the Stripe webhook in stripe.js, using the bot's own auth token as the
// key (Viber doesn't issue a separate webhook signing secret) — the actual
// verification logic is shared with it via crypto.js.
import { verifyHmacHex } from './crypto.js';

export function verifyViberSignature(rawBody, signature, authToken) {
  return verifyHmacHex(authToken, rawBody, signature);
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
