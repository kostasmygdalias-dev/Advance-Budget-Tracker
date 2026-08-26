// The Viber bot needs to act on a user's Sheet independently of the
// browser, so it needs a standing credential — a Google OAuth refresh
// token. The frontend's own GIS token-client flow never issues one (it's
// designed for short-lived access tokens the browser re-requests silently);
// only the authorization-code flow does, and only when Google is asked for
// offline access. This is the one place this Worker holds a long-lived
// credential per connected user — see the "Connect Viber" flow in
// Settings.jsx and VIBER_SETUP.md for the full picture.
export async function exchangeCodeForTokens(env, code, redirectUri) {
  const res = await fetch('https://oauth2.googleapis.com/token', {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      code,
      client_id: env.GOOGLE_CLIENT_ID,
      client_secret: env.GOOGLE_CLIENT_SECRET,
      redirect_uri: redirectUri,
      grant_type: 'authorization_code',
    }),
  });
  if (!res.ok) throw new Error(`Google token exchange failed: ${res.status} ${await res.text()}`);
  return res.json(); // { access_token, refresh_token, id_token, expires_in, scope, token_type }
}

export async function refreshAccessToken(env, refreshToken) {
  const res = await fetch('https://oauth2.googleapis.com/token', {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      refresh_token: refreshToken,
      client_id: env.GOOGLE_CLIENT_ID,
      client_secret: env.GOOGLE_CLIENT_SECRET,
      grant_type: 'refresh_token',
    }),
  });
  if (!res.ok) throw new Error(`Google token refresh failed: ${res.status} ${await res.text()}`);
  const data = await res.json();
  return data.access_token;
}

// Called on disconnect — invalidates the token with Google itself, not
// just our copy of it, so "Disconnect" actually revokes access rather than
// merely forgetting the credential locally.
export async function revokeRefreshToken(refreshToken) {
  await fetch('https://oauth2.googleapis.com/revoke', {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({ token: refreshToken }),
  }).catch(() => {}); // best-effort — local KV cleanup still proceeds either way
}

export async function fetchGoogleUserInfo(accessToken) {
  const res = await fetch('https://www.googleapis.com/oauth2/v3/userinfo', {
    headers: { Authorization: `Bearer ${accessToken}` },
  });
  if (!res.ok) throw new Error('Failed to fetch Google user info');
  return res.json(); // { sub, email, name, ... }
}
