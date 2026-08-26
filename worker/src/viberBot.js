// Handles one incoming Viber message end to end: link codes, or (for an
// already-linked, still-Pro account) parse via the LLM and act on the
// user's Sheet. Kept separate from index.js's HTTP routing/webhook parsing.
import { getSubscription } from './kv.js';
import { getSubForViberUser, consumeLinkCode, linkViberUser } from './kv.js';
import { getRefreshToken } from './kv.js';
import { refreshAccessToken } from './googleOAuth.js';
import { findSpreadsheetId, getCategories, listExpenses, listIncomes, appendExpense, appendIncome, deleteRow } from './sheetsClient.js';
import { parseMessage } from './llm.js';
import { categoryRollupIds, buildExpenseReport, buildIncomeReport } from './report.js';
import { sendViberMessage } from './viber.js';

const fmt = (n, c) => `${(n || 0).toFixed(2)} ${c}`;
const todayStr = () => new Date().toISOString().slice(0, 10);
const monthStartStr = () => `${todayStr().slice(0, 7)}-01`;

async function reply(env, viberUserId, text) {
  await sendViberMessage(env, viberUserId, text);
}

export async function handleViberMessage(env, { viberUserId, text }) {
  const trimmed = (text || '').trim();

  // Linking: "/link ABC123" — works even before this Viber user has any
  // other account association.
  const linkMatch = trimmed.match(/^\/link\s+(\S+)$/i);
  if (linkMatch) {
    const sub = await consumeLinkCode(env, linkMatch[1]);
    if (!sub) {
      await reply(env, viberUserId, "That code isn't valid or has expired — go to Settings in the app and click Connect Viber to get a new one.");
      return;
    }
    await linkViberUser(env, viberUserId, sub);
    await reply(env, viberUserId, "✅ Connected! Try things like \"add 15 euros for coffee\", \"remove the last one\", or \"how much did I spend this month\".");
    return;
  }

  const sub = await getSubForViberUser(env, viberUserId);
  if (!sub) {
    await reply(env, viberUserId, "You're not connected to an account yet — go to Settings in the app and click Connect Viber.");
    return;
  }

  const subscription = await getSubscription(env, sub);
  if (subscription?.status !== 'active') {
    await reply(env, viberUserId, 'This is a Pro feature and your subscription is no longer active — open the app and upgrade to keep using it here.');
    return;
  }

  const refreshToken = await getRefreshToken(env, sub);
  if (!refreshToken) {
    await reply(env, viberUserId, "Your Google connection needs to be re-authorized — go to Settings in the app and click Connect Viber again.");
    return;
  }

  let accessToken;
  try {
    accessToken = await refreshAccessToken(env, refreshToken);
  } catch {
    await reply(env, viberUserId, "Couldn't reach your Google account — try again in a moment, or reconnect from Settings if this keeps happening.");
    return;
  }

  const spreadsheetId = await findSpreadsheetId(accessToken);
  if (!spreadsheetId) {
    await reply(env, viberUserId, "I couldn't find your expense data yet — add at least one expense or income in the app first, then try again here.");
    return;
  }

  const categories = await getCategories(accessToken, spreadsheetId);
  const parsed = await parseMessage(env, {
    text: trimmed,
    today: todayStr(),
    defaultCurrency: 'EUR',
    categories,
  });

  if (parsed.action === 'add_expense') {
    if (!(parsed.amount > 0)) {
      await reply(env, viberUserId, "I couldn't tell how much that was for — try again with an amount, e.g. \"add 12.50 for lunch\".");
      return;
    }
    const saved = await appendExpense(accessToken, spreadsheetId, {
      description: parsed.description || 'Expense', amount: parsed.amount,
      currency: parsed.currency, paid_date: parsed.date || todayStr(),
      category_id: parsed.category_id,
    });
    await reply(env, viberUserId, `✅ Added expense: ${fmt(saved.amount, saved.currency)} — ${saved.description} (${saved.paid_date})`);
    return;
  }

  if (parsed.action === 'add_income') {
    if (!(parsed.amount > 0)) {
      await reply(env, viberUserId, "I couldn't tell how much that was for — try again with an amount, e.g. \"add 500 salary\".");
      return;
    }
    const saved = await appendIncome(accessToken, spreadsheetId, {
      description: parsed.description || 'Income', amount: parsed.amount,
      currency: parsed.currency, received_date: parsed.date || todayStr(),
      source: 'other',
    });
    await reply(env, viberUserId, `✅ Added income: +${fmt(saved.amount, saved.currency)} — ${saved.description} (${saved.received_date})`);
    return;
  }

  if (parsed.action === 'delete') {
    const [expenses, incomes] = await Promise.all([
      listExpenses(accessToken, spreadsheetId),
      listIncomes(accessToken, spreadsheetId),
    ]);
    const hint = (parsed.delete_hint || '').toLowerCase();
    const candidates = [
      ...expenses.map((e) => ({ ...e, _kind: 'Expenses', _date: e.paid_date })),
      ...incomes.map((i) => ({ ...i, _kind: 'Incomes', _date: i.received_date })),
    ].filter((r) => !hint || (r.description || '').toLowerCase().includes(hint));
    candidates.sort((a, b) => (b.created_date || '').localeCompare(a.created_date || ''));
    const target = candidates[0];
    if (!target) {
      await reply(env, viberUserId, hint ? `Couldn't find a recent entry matching "${parsed.delete_hint}".` : "You don't have anything to delete yet.");
      return;
    }
    await deleteRow(accessToken, spreadsheetId, target._kind, target._row);
    const sign = target._kind === 'Incomes' ? '+' : '';
    await reply(env, viberUserId, `🗑️ Deleted: ${sign}${fmt(target.amount, target.currency)} — ${target.description} (${target._date})`);
    return;
  }

  if (parsed.action === 'report') {
    const fromDate = parsed.report_from || monthStartStr();
    const toDate = parsed.report_to || todayStr();
    const currency = 'EUR';
    const [expenses, incomes] = await Promise.all([
      listExpenses(accessToken, spreadsheetId),
      listIncomes(accessToken, spreadsheetId),
    ]);
    const categoryIds = categoryRollupIds(parsed.report_category_id, categories);
    const expenseReport = buildExpenseReport(expenses, { fromDate, toDate, categoryIds, currency });
    const categoryName = parsed.report_category_id
      ? (categories.find((c) => c.id === parsed.report_category_id)?.name || 'that category')
      : null;

    let lines = [];
    if (categoryName) {
      lines.push(`${categoryName}: ${fmt(expenseReport.total, currency)} across ${expenseReport.count} transaction${expenseReport.count === 1 ? '' : 's'} (${fromDate} to ${toDate}).`);
    } else {
      const incomeReport = buildIncomeReport(incomes, { fromDate, toDate, currency });
      lines.push(`${fromDate} to ${toDate}:`);
      lines.push(`Spent: ${fmt(expenseReport.total, currency)} (${expenseReport.count} transactions)`);
      lines.push(`Income: +${fmt(incomeReport.total, currency)} (${incomeReport.count} transactions)`);
      lines.push(`Net: ${incomeReport.total - expenseReport.total >= 0 ? '+' : ''}${fmt(incomeReport.total - expenseReport.total, currency)}`);
      if (incomeReport.otherCurrencies.length) lines.push(`(Also some income in ${incomeReport.otherCurrencies.join(', ')}, not included above.)`);
    }
    if (expenseReport.otherCurrencies.length) lines.push(`(Also some expenses in ${expenseReport.otherCurrencies.join(', ')}, not included above.)`);

    await reply(env, viberUserId, lines.join('\n'));
    return;
  }

  await reply(env, viberUserId, "I can add expenses/income, delete the most recent entry, or pull a report — try \"add 20 for groceries\", \"remove the last one\", or \"how much did I spend this month\".");
}
