// Pure calculations behind the "Insights" page and its matching Dashboard
// widgets: biggest expense, top category (with a month-over-month delta),
// a burn-rate projection, an unusual-transaction flag, and the recurring
// vs. variable split. All scoped to expenses only, one month at a time —
// no JSX here. See src/pages/Insights.jsx and the biggestExpense/
// topCategory/burnRate/unusualExpense/recurringSplit cases in
// src/pages/Dashboard.jsx.
import { getMonthlyContribution, currentMonthStr } from '@/lib/finance';
import { amountIncludingChildren, buildCategoryReport } from '@/lib/categoryTree';

const pad2 = (n) => String(n).padStart(2, '0');
const dateStr = (d) => `${d.getFullYear()}-${pad2(d.getMonth() + 1)}-${pad2(d.getDate())}`;

function byCurrency(expenses, currency) {
  return expenses.filter((e) => (e.currency || 'EUR') === currency);
}

export function getBiggestExpense({ expenses, month, currency }) {
  let best = null;
  byCurrency(expenses, currency).forEach((expense) => {
    const contribution = getMonthlyContribution(expense, month);
    if (contribution > 0 && (!best || contribution > best.contribution)) {
      best = { expense, contribution };
    }
  });
  return best;
}

function buildCategoryTotals(expenses, month, currency) {
  const byCategory = {};
  const byCategoryCounts = {};
  byCurrency(expenses, currency).forEach((e) => {
    const contrib = getMonthlyContribution(e, month);
    if (contrib <= 0) return;
    const key = e.category_id || 'uncategorized';
    byCategory[key] = (byCategory[key] || 0) + contrib;
    byCategoryCounts[key] = (byCategoryCounts[key] || 0) + 1;
  });
  return { byCategory, byCategoryCounts };
}

export function getTopCategory({ expenses, categories, month, prevMonth, currency, uncategorizedLabel }) {
  const { byCategory, byCategoryCounts } = buildCategoryTotals(expenses, month, currency);
  const report = buildCategoryReport(byCategory, byCategoryCounts, categories, uncategorizedLabel);
  const top = report[0];
  if (!top) return null;

  const { byCategory: prevByCategory } = buildCategoryTotals(expenses, prevMonth, currency);
  const prevTotal = amountIncludingChildren(top.id, prevByCategory, categories);
  // null (not Infinity) when there's no prior-month baseline to compare against.
  const deltaPct = prevTotal > 0 ? ((top.total - prevTotal) / prevTotal) * 100 : null;

  return { category: top, prevTotal, deltaPct };
}

export function getBurnRate({ expenses, month, currency, today }) {
  if (month !== currentMonthStr(today)) return null;
  const daysElapsed = today.getDate();
  const daysInMonth = new Date(today.getFullYear(), today.getMonth() + 1, 0).getDate();
  if (daysElapsed <= 0) return null;

  const todayIso = dateStr(today);
  let singlesSoFar = 0;
  let amortizedTotal = 0;
  byCurrency(expenses, currency).forEach((e) => {
    const contrib = getMonthlyContribution(e, month);
    if (contrib <= 0) return;
    if (e.expense_type === 'amortized') {
      // No day field in an amortization schedule entry, so it can't be
      // day-gated — treat it as already committed for the whole month.
      amortizedTotal += contrib;
    } else if (e.paid_date <= todayIso) {
      // Future-dated expenses are allowed by the form, so this guard is
      // load-bearing: without it, a pre-logged future bill would inflate
      // "spent so far" for a month that hasn't reached that day yet.
      singlesSoFar += contrib;
    }
  });

  const spentSoFar = singlesSoFar + amortizedTotal;
  const dailyAvg = singlesSoFar / daysElapsed;
  // Amortized spend is added as a fixed addend rather than projected
  // linearly — blending it into the daily average would badly overshoot
  // early in the month (e.g. day 1 with any active subscription).
  const projectedTotal = dailyAvg * daysInMonth + amortizedTotal;

  return { spentSoFar, dailyAvg, projectedTotal, daysElapsed, daysInMonth };
}

export function getUnusualExpense({ expenses, month, currency, minOtherSampleSize = 3, thresholdMultiplier = 2 }) {
  // Amortized expenses are excluded on both sides: a known big-ticket
  // purchase isn't a "surprise transaction," and including it would itself
  // skew the category's baseline for unrelated small transactions.
  const sameCurrency = byCurrency(expenses, currency).filter((e) => e.expense_type !== 'amortized');
  const thisMonthCandidates = sameCurrency.filter((e) => getMonthlyContribution(e, month) > 0);

  let best = null;
  thisMonthCandidates.forEach((candidate) => {
    const key = candidate.category_id || 'uncategorized';
    // Leave-one-out mean: comparing a candidate against a baseline that
    // includes itself understates real outliers' ratio.
    const others = sameCurrency.filter((e) => e.id !== candidate.id && (e.category_id || 'uncategorized') === key);
    if (others.length < minOtherSampleSize) return;
    const mean = others.reduce((s, e) => s + (e.amount || 0), 0) / others.length;
    if (mean <= 0) return;
    const ratio = (candidate.amount || 0) / mean;
    if (ratio > thresholdMultiplier && (!best || ratio > best.ratio)) {
      best = { expense: candidate, categoryMean: mean, ratio };
    }
  });
  return best;
}

export function getRecurringSplit({ expenses, month, currency }) {
  let recurringTotal = 0;
  let variableTotal = 0;
  byCurrency(expenses, currency).forEach((e) => {
    const contrib = getMonthlyContribution(e, month);
    if (contrib <= 0) return;
    if (e.recurring_template_id != null) recurringTotal += contrib;
    else variableTotal += contrib;
  });
  if (recurringTotal <= 0 && variableTotal <= 0) return null;
  const recurringPct = (recurringTotal / (recurringTotal + variableTotal)) * 100;
  return { recurringTotal, variableTotal, recurringPct };
}
