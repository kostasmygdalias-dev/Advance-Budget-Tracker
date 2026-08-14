// Two small mappings in one KV namespace:
//   sub:<googleSub>       -> { status, stripeCustomerId, stripeSubscriptionId, currentPeriodEnd, updatedAt }
//   customer:<stripeId>   -> googleSub
// The second exists because subscription-lifecycle webhook events (update/
// cancel) only carry the Stripe customer/subscription id, not the Google
// account id — this is how we find our way back to "whose subscription".
const subKey = (sub) => `sub:${sub}`;
const customerKey = (customerId) => `customer:${customerId}`;

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
