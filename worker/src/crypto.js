// Shared Web Crypto helpers for verifying webhook signatures — both
// stripe.js and viber.js check an HMAC-SHA256 over the raw request body,
// hex-encoded, just gathered from a slightly different header shape.

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

// Computes HMAC-SHA256(secret, message) and compares it against a
// hex-encoded signature in constant time. Plain === on hex strings would
// short-circuit on the first mismatched character, leaking how many
// leading bytes were correct through response timing; Cloudflare Workers
// extends SubtleCrypto with timingSafeEqual specifically to avoid that (a
// constant-time comparison isn't reliably expressible in plain JS — the
// JIT can optimize away the "constant" part), so this uses the runtime's
// own implementation rather than hand-rolling one.
export async function verifyHmacHex(secret, message, providedHex) {
  const providedBytes = hexToBytes(providedHex);
  if (!providedBytes) return false;
  const expected = await hmacSha256(secret, message);
  if (expected.byteLength !== providedBytes.byteLength) return false;
  return crypto.subtle.timingSafeEqual(expected, providedBytes);
}
