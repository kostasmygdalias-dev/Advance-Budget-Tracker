import { addDays, addWeeks, subDays, subWeeks, format } from 'date-fns';
import { entities } from '@/lib/sheetsStore';
import { parseDateLocal } from '@/lib/finance';

// The day of the month a monthly template is meant to land on. Stored
// separately because the due date alone can't remember it: a template due
// on the 31st has to fall on the 28th in February, and stepping on from the
// 28th would then give the 28th forever after.
export function anchorDayOf(template) {
  if (template.anchor_day) return template.anchor_day;
  return template.next_due_date ? parseDateLocal(template.next_due_date).getDate() : 1;
}

// Moves a date by whole months, landing on `anchorDay` or the month's last
// day when it's shorter (31st -> 28 Feb -> 31 Mar).
export function shiftMonths(dateStr, months, anchorDay) {
  const d = parseDateLocal(dateStr);
  const target = new Date(d.getFullYear(), d.getMonth() + months, 1);
  const lastDay = new Date(target.getFullYear(), target.getMonth() + 1, 0).getDate();
  target.setDate(Math.min(anchorDay || d.getDate(), lastDay));
  return target;
}

// Parse as local calendar components, not `new Date(dateStr)` (UTC midnight),
// which can roll a month-start date back a day for timezones west of UTC.
export function advanceDate(dateStr, frequency, customDays, anchorDay) {
  const d = parseDateLocal(dateStr);
  if (frequency === 'daily') return addDays(d, 1);
  if (frequency === 'weekly') return addWeeks(d, 1);
  if (frequency === 'monthly') return shiftMonths(dateStr, 1, anchorDay);
  return addDays(d, customDays || 1);
}

export function regressDate(dateStr, frequency, customDays, anchorDay) {
  const d = parseDateLocal(dateStr);
  if (frequency === 'daily') return subDays(d, 1);
  if (frequency === 'weekly') return subWeeks(d, 1);
  if (frequency === 'monthly') return shiftMonths(dateStr, -1, anchorDay);
  return subDays(d, customDays || 1);
}

const MAX_CATCH_UP_PER_TEMPLATE = 24;

// The entry a template produces for one occurrence. Leaves the template's
// due date alone — that's generateOne's job, and restoring a missed past
// occurrence mustn't move it.
export async function createOccurrence(t, date, defaultCurrency) {
  if (t.type === 'income') {
    return entities.Income.create({
      description: t.description,
      amount: t.amount,
      currency: t.currency || defaultCurrency,
      received_date: date,
      source: t.source || 'other',
      tags: ['recurring'],
      recurring_template_id: t.id,
    });
  }
  return entities.Expense.create({
    description: t.description,
    amount: t.amount,
    currency: t.currency || defaultCurrency,
    paid_date: date,
    category_id: t.category_id || null,
    payment_method: 'card',
    expense_type: 'single',
    amortization_schedule: [],
    tags: ['recurring'],
    recurring_template_id: t.id,
  });
}

async function generateOne(t, defaultCurrency) {
  await createOccurrence(t, t.next_due_date, defaultCurrency);
  const anchor_day = t.frequency === 'monthly' ? anchorDayOf(t) : t.anchor_day ?? null;
  const next_due_date = format(advanceDate(t.next_due_date, t.frequency, t.custom_interval_days, anchor_day), 'yyyy-MM-dd');
  // Writing the anchor back captures it for templates saved before the
  // column existed, while their due date still shows the intended day.
  await entities.RecurringTemplate.update(t.id, { next_due_date, anchor_day });
  return next_due_date;
}

// Runs are chained, never concurrent: the app runs this on open and the
// Recurring page runs it again on load/save, and two overlapping runs would
// each see the same due date and create the entry twice. Each run also
// re-reads the templates itself rather than trusting a list handed in, since
// a list fetched before an earlier run finished still carries the old due
// dates.
let queue = Promise.resolve();

// Widens every active template's start_date back to `fromDate`, then runs
// the usual pass, which fills in each occurrence from there on that has no
// entry — the "check everything since August" action on the Recurring page.
// A start already earlier than `fromDate` is left as it is.
export function fillAllRecurringFrom(fromDate) {
  const widen = queue.then(async () => {
    const templates = await entities.RecurringTemplate.list();
    for (const t of templates) {
      if (t.active && (!t.start_date || t.start_date > fromDate)) {
        await entities.RecurringTemplate.update(t.id, { start_date: fromDate });
      }
    }
  });
  queue = widen.catch(() => {});
  return widen.then(() => generateDueRecurring());
}

export function generateDueRecurring() {
  const run = queue.then(async () => {
    const [templates, settings] = await Promise.all([
      entities.RecurringTemplate.list(),
      entities.Settings.list(),
    ]);
    const defaultCurrency = settings[0]?.default_currency || 'EUR';
    const today = format(new Date(), 'yyyy-MM-dd');
    let generated = 0;
    for (const t of templates) {
      if (!t.active) continue;
      let dueDate = t.next_due_date;
      const anchor = t.frequency === 'monthly' ? anchorDayOf(t) : t.anchor_day;
      let iterations = 0;
      // Every occurrence missed since the last run gets its own entry on its
      // own date — three months away from the app means three rent entries,
      // not one.
      while (dueDate && dueDate <= today && iterations < MAX_CATCH_UP_PER_TEMPLATE) {
        dueDate = await generateOne({ ...t, next_due_date: dueDate, anchor_day: anchor }, defaultCurrency);
        generated++;
        iterations++;
      }
    }
    // Re-read: the loop above has moved due dates on.
    const current = generated > 0 ? await entities.RecurringTemplate.list() : templates;
    generated += await restoreMissingOccurrences(current, defaultCurrency);
    return generated;
  });
  // A failed run mustn't wedge every later one behind it.
  queue = run.catch(() => {});
  return run;
}

const MAX_MISSING_LOOKBACK = 400;
const MAX_RESTORE_PER_TEMPLATE = 24;
const entryDate = (e) => e.paid_date || e.received_date;
const sameText = (a, b) => (a || '').trim().toLowerCase() === (b || '').trim().toLowerCase();

// The occurrences a template has already passed (everything before its
// next_due_date and up to today, back to `fromDate`) that have no entry left. An occurrence
// counts as covered by any entry in its own period, not just on its exact
// day, so one whose date was edited by hand isn't reported; by an unlinked
// entry with the same description and amount, so one re-typed by hand after
// a deletion isn't restored a second time; and by a date in skipped_dates,
// which is an occurrence deleted on purpose.
export function findMissingOccurrences(t, entries, fromDate) {
  if (!t.next_due_date || !fromDate) return [];
  const anchor = t.frequency === 'monthly' ? anchorDayOf(t) : t.anchor_day;
  const today = format(new Date(), 'yyyy-MM-dd');
  const covering = entries
    .filter((e) => e.recurring_template_id === t.id
      || (!e.recurring_template_id && sameText(e.description, t.description) && Number(e.amount) === Number(t.amount)))
    .map(entryDate)
    .concat(t.skipped_dates || []);
  const missing = [];
  let periodEnd = t.next_due_date;
  for (let i = 0; i < MAX_MISSING_LOOKBACK; i++) {
    const due = format(regressDate(periodEnd, t.frequency, t.custom_interval_days, anchor), 'yyyy-MM-dd');
    if (due < fromDate) break;
    const end = periodEnd;
    // Only dates already reached: a due date edited months ahead leaves
    // periods before it that simply haven't happened yet.
    if (due <= today && !covering.some((d) => d >= due && d < end)) missing.push(due);
    periodEnd = due;
  }
  return missing.reverse();
}

// Puts back any occurrence a template has passed that no longer has an entry
// — deleted by mistake in the app, or straight from the Sheet. Looks back to
// the template's start_date; a template saved before that column existed
// adopts its oldest remaining entry as the start, which is then stored so
// the window doesn't shrink if that entry is deleted later. Deleting through
// the app records the date as skipped (deleteEntries), so a deliberate
// deletion stays deleted.
async function restoreMissingOccurrences(templates, defaultCurrency) {
  const [expenses, incomes] = await Promise.all([entities.Expense.list(), entities.Income.list()]);
  let restored = 0;
  for (const t of templates) {
    if (!t.active) continue;
    const entries = t.type === 'income' ? incomes : expenses;
    let from = t.start_date;
    if (!from) {
      from = entries.filter((e) => e.recurring_template_id === t.id).map(entryDate).filter(Boolean).sort()[0];
      if (!from) continue;
      await entities.RecurringTemplate.update(t.id, { start_date: from });
    }
    const missing = findMissingOccurrences(t, entries, from).slice(-MAX_RESTORE_PER_TEMPLATE);
    for (const date of missing) {
      await createOccurrence(t, date, defaultCurrency);
      restored++;
    }
  }
  return restored;
}
