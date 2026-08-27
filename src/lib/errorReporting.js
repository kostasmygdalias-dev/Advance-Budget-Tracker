// Best-effort client-error reporting to the billing Worker — the app's only
// server-side piece — so a broken production build or a runtime crash
// actually surfaces somewhere (visible via `wrangler tail` / Cloudflare's
// Logs) instead of nobody knowing until a user happens to mention it.
// Silently does nothing if the Worker isn't configured (same fail-open
// convention as subscription.js), and never throws itself — an error
// handler that can itself error would be its own kind of bad.
const API_URL = import.meta.env.VITE_SUBSCRIPTION_API_URL;

export function reportClientError(message, extra = {}) {
  if (!API_URL) return;
  try {
    const body = JSON.stringify({
      message: String(message ?? 'Unknown error').slice(0, 2000),
      url: window.location.href,
      userAgent: navigator.userAgent,
      ...extra,
    });
    // keepalive lets this survive a page unload, similar to sendBeacon —
    // used instead of sendBeacon because that API can't reliably send a
    // JSON body cross-origin (it doesn't support CORS preflight the way
    // fetch does, and application/json isn't a CORS-"simple" content type).
    fetch(`${API_URL}/client-error`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body,
      keepalive: true,
    }).catch(() => {});
  } catch {
    // Never let error reporting itself throw.
  }
}

// Call once, early — catches anything that reaches the top without a more
// specific handler (e.g. ChunkErrorBoundary, which reports its own catches
// separately since it also drives an auto-reload).
export function installGlobalErrorReporting() {
  window.addEventListener('error', (event) => {
    reportClientError(event.message, {
      stack: event.error?.stack,
      source: event.filename,
      line: event.lineno,
    });
  });
  window.addEventListener('unhandledrejection', (event) => {
    const reason = event.reason;
    reportClientError(reason?.message || String(reason), {
      stack: reason?.stack,
      kind: 'unhandledrejection',
    });
  });
}
