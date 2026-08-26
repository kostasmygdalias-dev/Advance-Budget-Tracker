// Client for the billing Worker (see /worker) — the one server-side piece
// this app has, whose only job is answering "is this Google account
// currently paying," so that gate can't be bypassed by editing the browser.
//
// Deliberately fails OPEN (full access) when VITE_SUBSCRIPTION_API_URL isn't
// set, rather than locking everyone out the moment this code ships. The
// gate only starts actually enforcing once the Worker is deployed and the
// env var points at it — see BILLING_SETUP.md.
import { getAccessToken, refreshAccessTokenSilently } from '@/lib/googleAuth';

const API_URL = import.meta.env.VITE_SUBSCRIPTION_API_URL;
const PAYMENT_LINK = import.meta.env.VITE_STRIPE_PAYMENT_LINK;

export function isBillingConfigured() {
  return Boolean(API_URL);
}

async function authedFetch(path, init = {}) {
  const doFetch = (token) => fetch(`${API_URL}${path}`, {
    ...init,
    headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json', ...(init.headers || {}) },
  });

  let res = await doFetch(getAccessToken());
  if (res.status === 401) {
    const fresh = await refreshAccessTokenSilently();
    res = await doFetch(fresh);
  }
  if (!res.ok) {
    throw new Error(`Billing API error ${res.status}: ${await res.text()}`);
  }
  return res.json();
}

// Free-tier default when billing isn't configured yet — everyone gets full
// access rather than the app appearing broken mid-setup.
const UNCONFIGURED_STATUS = { active: true, status: 'not_configured' };

export async function fetchSubscriptionStatus() {
  if (!isBillingConfigured()) return UNCONFIGURED_STATUS;
  try {
    return await authedFetch('/subscription-status');
  } catch {
    // Fail closed on a real (configured) billing check that errors out —
    // unlike "not configured," this means something is actually wrong, and
    // silently granting access would defeat the point of a paid gate.
    return { active: false, status: 'error' };
  }
}

export function getUpgradeUrl(user) {
  if (!PAYMENT_LINK || !user?.sub) return null;
  const url = new URL(PAYMENT_LINK);
  url.searchParams.set('client_reference_id', user.sub);
  if (user.email) url.searchParams.set('prefilled_email', user.email);
  return url.toString();
}

export async function openBillingPortal() {
  const { url } = await authedFetch('/create-portal-session', {
    method: 'POST',
    body: JSON.stringify({ returnUrl: `${window.location.origin}/#/settings` }),
  });
  window.location.href = url;
}

// --- Viber bot (Pro feature) -----------------------------------------
// Connecting requires a *different* OAuth flow than sign-in: the app's own
// GIS token-client flow never issues a refresh token, and the Worker needs
// one to act on the user's Sheet from a chat message with no browser open.
// This redirects through Google's full consent screen with offline access
// instead of the silent token-client request used everywhere else in the
// app — see worker/src/googleOAuth.js for why.
export function startViberConnect() {
  const redirectUri = `${API_URL}/oauth/callback`;
  const scope = [
    'openid', 'email',
    'https://www.googleapis.com/auth/spreadsheets',
    'https://www.googleapis.com/auth/drive.file',
  ].join(' ');
  const url = new URL('https://accounts.google.com/o/oauth2/v2/auth');
  url.searchParams.set('client_id', import.meta.env.VITE_GOOGLE_CLIENT_ID);
  url.searchParams.set('redirect_uri', redirectUri);
  url.searchParams.set('response_type', 'code');
  url.searchParams.set('scope', scope);
  url.searchParams.set('access_type', 'offline');
  url.searchParams.set('prompt', 'consent');
  window.location.href = url.toString();
}

export async function getViberStatus() {
  if (!isBillingConfigured()) return { connected: false };
  return authedFetch('/viber/status');
}

export async function disconnectViber() {
  return authedFetch('/viber/unlink', { method: 'POST' });
}
