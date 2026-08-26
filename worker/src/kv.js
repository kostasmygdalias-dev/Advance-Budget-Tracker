// Mappings in the same KV namespace, distinguished by key prefix:
//   sub:<googleSub>          -> { status, stripeCustomerId, stripeSubscriptionId, currentPeriodEnd, updatedAt }
//   customer:<stripeId>      -> googleSub
//   refresh:<googleSub>      -> Google OAuth refresh token (Viber bot's standing access to that user's Sheet)
//   viber:<viberUserId>      -> googleSub                  (forward: incoming message -> whose account)
//   viberlink:<googleSub>    -> viberUserId                (reverse: Settings page connect/disconnect status)
//   linkcode:<code>          -> googleSub                  (short-lived, consumed by the first "/link CODE" message)
const subKey = (sub) => `sub:${sub}`;
const customerKey = (customerId) => `customer:${customerId}`;
const refreshKey = (sub) => `refresh:${sub}`;
const viberKey = (viberUserId) => `viber:${viberUserId}`;
const viberLinkKey = (sub) => `viberlink:${sub}`;
const linkCodeKey = (code) => `linkcode:${code}`;

export async function getSubscription(env, sub) {
  const raw = await env.SUBSCRIPTIONS.get(subKey(sub));
  return raw ? JSON.parse(raw) : null;
}

export async function setSubscription(env, sub, data) {
  await env.SUBSCRIPTIONS.put(subKey(sub), JSON.stringify(data));
}

export async function linkCustomerToSub(env, customerId, sub) {
  await env.SUBSCRIPTIONS.put(customerKey(customerId), sub);
}

export async function getSubForCustomer(env, customerId) {
  return env.SUBSCRIPTIONS.get(customerKey(customerId));
}

export async function setRefreshToken(env, sub, refreshToken) {
  await env.SUBSCRIPTIONS.put(refreshKey(sub), refreshToken);
}

export async function getRefreshToken(env, sub) {
  return env.SUBSCRIPTIONS.get(refreshKey(sub));
}

export async function deleteRefreshToken(env, sub) {
  await env.SUBSCRIPTIONS.delete(refreshKey(sub));
}

export async function createLinkCode(env, sub) {
  const code = Array.from(crypto.getRandomValues(new Uint8Array(4)))
    .map((b) => b.toString(36)).join('').slice(0, 6).toUpperCase();
  await env.SUBSCRIPTIONS.put(linkCodeKey(code), sub, { expirationTtl: 900 }); // 15 minutes
  return code;
}

export async function consumeLinkCode(env, code) {
  const key = linkCodeKey(code.toUpperCase());
  const sub = await env.SUBSCRIPTIONS.get(key);
  if (sub) await env.SUBSCRIPTIONS.delete(key);
  return sub;
}

export async function linkViberUser(env, viberUserId, sub) {
  await env.SUBSCRIPTIONS.put(viberKey(viberUserId), sub);
  await env.SUBSCRIPTIONS.put(viberLinkKey(sub), viberUserId);
}

export async function getSubForViberUser(env, viberUserId) {
  return env.SUBSCRIPTIONS.get(viberKey(viberUserId));
}

export async function getViberUserForSub(env, sub) {
  return env.SUBSCRIPTIONS.get(viberLinkKey(sub));
}

export async function unlinkViberUser(env, sub) {
  const viberUserId = await getViberUserForSub(env, sub);
  if (viberUserId) await env.SUBSCRIPTIONS.delete(viberKey(viberUserId));
  await env.SUBSCRIPTIONS.delete(viberLinkKey(sub));
}
