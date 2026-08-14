// Client-side Google Sign-In + OAuth, replacing Base44 auth entirely.
// One consent grants both identity (who's signed in) and Sheets/Drive API
// access, since this app authenticates AND stores data via the same Google
// account. No backend involved — the access token lives only in this tab.
const CLIENT_ID = import.meta.env.VITE_GOOGLE_CLIENT_ID;
const SCOPES = [
  'openid',
  'email',
  'profile',
  'https://www.googleapis.com/auth/spreadsheets',
  'https://www.googleapis.com/auth/drive.file',
].join(' ');

const TOKEN_KEY = 'expensetrack_access_token';
const TOKEN_EXPIRY_KEY = 'expensetrack_access_token_expiry';
const PROFILE_HINT_KEY = 'expensetrack_google_profile_hint';

let accessToken = sessionStorage.getItem(TOKEN_KEY) || null;
const cachedExpiry = Number(sessionStorage.getItem(TOKEN_EXPIRY_KEY) || 0);
if (accessToken && Date.now() >= cachedExpiry) {
  accessToken = null; // stale token from a previous session; force a fresh one
}

export function getAccessToken() {
  if (!accessToken) throw new Error('Not signed in to Google.');
  return accessToken;
}

export function hasAccessToken() {
  return !!accessToken;
}

export function setAccessToken(token, expiresInSeconds) {
  accessToken = token;
  if (token) {
    sessionStorage.setItem(TOKEN_KEY, token);
    sessionStorage.setItem(TOKEN_EXPIRY_KEY, String(Date.now() + (expiresInSeconds || 3600) * 1000 - 60000));
  } else {
    sessionStorage.removeItem(TOKEN_KEY);
    sessionStorage.removeItem(TOKEN_EXPIRY_KEY);
  }
}

export function getProfileHint() {
  try {
    return JSON.parse(localStorage.getItem(PROFILE_HINT_KEY) || 'null');
  } catch {
    return null;
  }
}

export function setProfileHint(profile) {
  if (profile) {
    localStorage.setItem(PROFILE_HINT_KEY, JSON.stringify({ email: profile.email }));
  } else {
    localStorage.removeItem(PROFILE_HINT_KEY);
  }
}

let gisReady = null;
function loadGis() {
  if (gisReady) return gisReady;
  gisReady = new Promise((resolve, reject) => {
    if (window.google?.accounts?.oauth2) return resolve();
    const script = document.createElement('script');
    script.src = 'https://accounts.google.com/gsi/client';
    script.async = true;
    script.defer = true;
    script.onload = () => resolve();
    script.onerror = () => reject(new Error('Failed to load Google Identity Services. Check your connection.'));
    document.head.appendChild(script);
  });
  return gisReady;
}

let tokenClient = null;
async function getTokenClient() {
  if (!CLIENT_ID) {
    throw new Error('VITE_GOOGLE_CLIENT_ID is not configured. See DEPLOY.md.');
  }
  await loadGis();
  if (!tokenClient) {
    tokenClient = window.google.accounts.oauth2.initTokenClient({
      client_id: CLIENT_ID,
      scope: SCOPES,
      callback: () => {}, // overridden per-call in requestAccessToken()
    });
  }
  return tokenClient;
}

// prompt: '' attempts a silent refresh using the user's existing Google
// session (no popup) — only succeeds if they previously granted consent and
// are still signed into Google in this browser. Any other value (or
// omitted) shows the normal consent/account-picker popup.
export function requestAccessToken({ silent = false } = {}) {
  return new Promise((resolve, reject) => {
    getTokenClient().then((client) => {
      client.callback = (resp) => {
        if (resp.error) return reject(new Error(resp.error));
        setAccessToken(resp.access_token, resp.expires_in);
        resolve(resp);
      };
      client.requestAccessToken(silent ? { prompt: '' } : { prompt: 'consent' });
    }, reject);
  });
}

export async function fetchUserInfo(token) {
  const res = await fetch('https://www.googleapis.com/oauth2/v3/userinfo', {
    headers: { Authorization: `Bearer ${token}` },
  });
  if (!res.ok) throw new Error('Failed to fetch Google account info.');
  return res.json(); // { sub, email, name, picture, ... }
}

export async function revokeAccessToken() {
  const token = accessToken;
  setAccessToken(null);
  setProfileHint(null);
  if (token) {
    await loadGis().catch(() => {});
    window.google?.accounts?.oauth2?.revoke(token, () => {});
  }
}

// Called by API clients on a 401 to get a fresh token without forcing the
// user through the full sign-in flow again, when their Google session is
// still active.
export async function refreshAccessTokenSilently() {
  const resp = await requestAccessToken({ silent: true });
  return resp.access_token;
}
