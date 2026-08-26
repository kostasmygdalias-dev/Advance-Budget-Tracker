// Date-range aggregation for the Viber "report" action. Mirrors the
// finance.js month-bucket logic (an amortized expense contributes via its
// precomputed amortization_schedule, not its paid_date) closely enough for
// a chat answer, without pulling in the frontend's full finance.js.
function monthInRange(monthStr, fromDate, toDate) {
  return monthStr >= fromDate.slice(0, 7) && monthStr <= toDate.slice(0, 7);
}

function rangeContribution(e, fromDate, toDate) {
  if (e.expense_type === 'amortized') {
    return (e.amortization_schedule || []).reduce((s, entry) => (monthInRange(entry.month, fromDate, toDate) ? s + entry.amount : s), 0);
  }
  return e.paid_date >= fromDate && e.paid_date <= toDate ? (e.amount || 0) : 0;
}

// A parent category id rolls up to include its direct subcategories, same
// as the Transactions page filter and the Reports page category focus.
export function categoryRollupIds(categoryId, categories) {
  if (!categoryId) return null;
  const ids = new Set([categoryId]);
  categories.forEach((c) => { if (c.parent_id === categoryId) ids.add(c.id); });
  return ids;
}

export function buildExpenseReport(expenses, { fromDate, toDate, categoryIds, currency }) {
  let total = 0, count = 0;
  const otherCurrencies = new Set();
  expenses.forEach((e) => {
    if (categoryIds && !categoryIds.has(e.category_id || 'uncategorized')) return;
    const contrib = rangeContribution(e, fromDate, toDate);
    if (contrib <= 0) return;
    if ((e.currency || 'EUR') !== currency) { otherCurrencies.add(e.currency || 'EUR'); return; }
    total += contrib;
    count++;
  });
  return { total, count, otherCurrencies: [...otherCurrencies] };
}

export function buildIncomeReport(incomes, { fromDate, toDate, currency }) {
  let total = 0, count = 0;
  const otherCurrencies = new Set();
  incomes.forEach((i) => {
    if (!(i.received_date >= fromDate && i.received_date <= toDate)) return;
    if ((i.currency || 'EUR') !== currency) { otherCurrencies.add(i.currency || 'EUR'); return; }
    total += i.amount || 0;
    count++;
  });
  return { total, count, otherCurrencies: [...otherCurrencies] };
}
