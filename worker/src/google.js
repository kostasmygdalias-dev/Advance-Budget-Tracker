// Verifies a Google OAuth access token by asking Google directly who it
// belongs to — the same access token the frontend already holds for calling
// Sheets/Drive. This Worker never sees a password or long-lived credential,
// only a short-lived token the client already has, and it uses that token
// for nothing except identifying the account (no Sheets/Drive calls here).
export async function verifyGoogleUser(request) {
  const auth = request.headers.get('Authorization') || '';
  const token = auth.startsWith('Bearer ') ? auth.slice(7) : null;
  if (!token) return null;

  const res = await fetch('https://www.googleapis.com/oauth2/v3/userinfo', {
    headers: { Authorization: `Bearer ${token}` },
  });
  if (!res.ok) return null;

  const info = await res.json();
  if (!info.sub) return null;
  return { sub: info.sub, email: info.email || null };
}
