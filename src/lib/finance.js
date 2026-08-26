const UNIT_DAYS = { day: 1, week: 7, month: 30.44, year: 365.25 };
const MS_PER_DAY = 86400000;

const round2 = (n) => Math.round(n * 100) / 100;

// `new Date("YYYY-MM-DD")` parses as UTC midnight; reading it back with local
// getters (getMonth/getDate) can roll a month-start date back to the previous
// month for anyone west of UTC. Parse the components directly instead so the
// date always lands on the calendar day the string names, in local time.
function parseDateLocal(dateStr) {
  const [y, m, d] = dateStr.split('-').map(Number);
  return new Date(y, m - 1, d);
}

export function periodToDays(periodValue, periodUnit) {
  if (!periodValue || !periodUnit) return 0;
  return periodValue * UNIT_DAYS[periodUnit];
}

export function averageMonthlyCost(amount, periodValue, periodUnit) {
  const days = periodToDays(periodValue, periodUnit);
  if (!days) return 0;
  return round2(amount / (days / 30.44));
}

function startOfMonth(d) {
  return new Date(d.getFullYear(), d.getMonth(), 1);
}
function addMonths(d, n) {
  return new Date(d.getFullYear(), d.getMonth() + n, 1);
}
function pad2(n) {
  return String(n).padStart(2, '0');
}
function toMonthStr(d) {
  return `${d.getFullYear()}-${pad2(d.getMonth() + 1)}`;
}

/**
 * Distribute `amount` across the period starting from paidDate. Returns
 * [{ month: "YYYY-MM", amount }].
 */
export function calculateAmortizationSchedule(paidDateStr, periodValue, periodUnit, amount) {
  if (!paidDateStr || !periodValue || !periodUnit || !amount) return [];

  // Month/year periods split into that many *equal* calendar-month
  // installments (60 over 6 months = 10, 10, 10, 10, 10, 10), starting the
  // month it was paid — regardless of which day of that month it landed on.
  // A day-weighted proration (below) would instead give each installment a
  // different amount depending on how many days of each calendar month the
  // period happens to touch, which isn't what "spread over 6 months" means
  // for something like a 6-month insurance premium.
  if (periodUnit === 'month' || periodUnit === 'year') {
    const monthCount = Math.max(1, Math.round(periodUnit === 'year' ? periodValue * 12 : periodValue));
    const perMonth = round2(amount / monthCount);
    const start = parseDateLocal(paidDateStr);
    const schedule = [];
    for (let i = 0; i < monthCount; i++) {
      schedule.push({ month: toMonthStr(addMonths(startOfMonth(start), i)), amount: perMonth });
    }
    const drift = round2(amount - schedule.reduce((s, e) => s + e.amount, 0));
    schedule[schedule.length - 1].amount = round2(schedule[schedule.length - 1].amount + drift);
    return schedule;
  }

  // Day/week periods don't map onto a whole number of months, so these stay
  // proportional to how many days of each calendar month the period spans.
  const totalDays = periodToDays(periodValue, periodUnit);
  if (totalDays <= 0) return [];

  const amountPerDay = amount / totalDays;
  const startMs = parseDateLocal(paidDateStr).getTime();
  const endMs = startMs + totalDays * MS_PER_DAY;

  const schedule = [];
  let cursorMs = startMs;
  while (cursorMs < endMs) {
    const cursor = new Date(cursorMs);
    const monthEndMs = addMonths(startOfMonth(cursor), 1).getTime();
    const segEndMs = Math.min(monthEndMs, endMs);
    const segDays = (segEndMs - cursorMs) / MS_PER_DAY;
    schedule.push({ month: toMonthStr(cursor), amount: round2(segDays * amountPerDay) });
    cursorMs = segEndMs;
  }

  // Correct rounding drift on the last entry so the schedule sums exactly to `amount`.
  const sum = schedule.reduce((s, e) => s + e.amount, 0);
  const drift = round2(amount - sum);
  if (schedule.length) {
    schedule[schedule.length - 1].amount = round2(schedule[schedule.length - 1].amount + drift);
  }
  return schedule;
}

export function getMonthlyContribution(expense, monthStr) {
  if (!expense) return 0;
  if (expense.expense_type === 'amortized') {
    const entry = (expense.amortization_schedule || []).find((s) => s.month === monthStr);
    return entry ? entry.amount : 0;
  }
  if (!expense.paid_date) return 0;
  return expense.paid_date.slice(0, 7) === monthStr ? expense.amount || 0 : 0;
}

export function isInMonth(dateStr, monthStr) {
  return !!dateStr && dateStr.slice(0, 7) === monthStr;
}

export function getRecentMonths(n, ref = new Date()) {
  const base = startOfMonth(ref);
  const months = [];
  for (let i = n - 1; i >= 0; i--) {
    months.push(toMonthStr(addMonths(base, -i)));
  }
  return months;
}

// Intl handles the actual month-name translation (Aug 2026 / Αυγ 2026) — no
// hardcoded name list to keep in sync with the translation dictionaries.
export function monthLabel(monthStr, lang = 'en') {
  const [y, m] = monthStr.split('-').map(Number);
  return new Intl.DateTimeFormat(lang, { month: 'short', year: 'numeric' }).format(new Date(y, m - 1, 1));
}

export function monthNameLong(monthStr, lang = 'en') {
  const [y, m] = monthStr.split('-').map(Number);
  return new Intl.DateTimeFormat(lang, { month: 'long' }).format(new Date(y, m - 1, 1));
}

export function shortMonth(date, lang = 'en') {
  return new Intl.DateTimeFormat(lang, { month: 'short' }).format(date);
}

export function currentMonthStr(ref = new Date()) {
  return toMonthStr(startOfMonth(ref));
}