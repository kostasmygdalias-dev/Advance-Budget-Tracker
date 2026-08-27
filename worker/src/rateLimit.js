// A cheap, KV-backed fixed-window rate limiter — good enough to blunt
// abuse of the Worker's public or signature-only-protected endpoints
// (every request still costs an invocation, regardless of whether the
// signature check ultimately rejects it) without needing Cloudflare's
// paid Rate Limiting Rules product. Fixed windows aren't perfectly
// precise (a burst can land up to ~2x the limit right at a window
// boundary) — fine for "stop a runaway script," not meant to be exact.
export async function isRateLimited(env, key, { limit, windowSeconds }) {
  const bucket = Math.floor(Date.now() / 1000 / windowSeconds);
  const kvKey = `ratelimit:${key}:${bucket}`;
  const current = Number((await env.SUBSCRIPTIONS.get(kvKey)) || '0');
  if (current >= limit) return true;
  // TTL covers this window and the next, so a key from the tail end of one
  // window doesn't get pruned before a request lands just after it rolls over.
  await env.SUBSCRIPTIONS.put(kvKey, String(current + 1), { expirationTtl: windowSeconds * 2 });
  return false;
}

// Cloudflare always sets this on incoming requests — the actual client IP,
// not spoofable by the request itself (Cloudflare overwrites it at the edge).
export function clientIp(request) {
  return request.headers.get('CF-Connecting-IP') || 'unknown';
}
