import { addDays, addMonths, addWeeks, format } from 'date-fns';
import { entities } from '@/lib/sheetsStore';
import { parseDateLocal } from '@/lib/finance';

// Parse as local calendar components, not `new Date(dateStr)` (UTC midnight),
// which can roll a month-start date back a day for timezones west of UTC.
export function advanceDate(dateStr, frequency, customDays) {
  const d = parseDateLocal(dateStr);
  if (frequency === 'daily') return addDays(d, 1);
  if (frequency === 'weekly') return addWeeks(d, 1);
  if (frequency === 'monthly') return addMonths(d, 1);
  return addDays(d, customDays || 1);
}

const MAX_CATCH_UP_PER_TEMPLATE = 24;

async function generateOne(t, defaultCurrency) {
  if (t.type === 'income') {
    await entities.Income.create({
      description: t.description,
      amount: t.amount,
      currency: t.currency || defaultCurrency,
      received_date: t.next_due_date,
      source: t.source || 'other',
      tags: ['recurring'],
      recurring_template_id: t.id,
    });
  } else {
    await entities.Expense.create({
      description: t.description,
      amount: t.amount,
      currency: t.currency || defaultCurrency,
      paid_date: t.next_due_date,
      category_id: t.category_id || null,
      payment_method: 'card',
      expense_type: 'single',
      amortization_schedule: [],
      tags: ['recurring'],
      recurring_template_id: t.id,
    });
  }
  const next_due_date = format(advanceDate(t.next_due_date, t.frequency, t.custom_interval_days), 'yyyy-MM-dd');
  await entities.RecurringTemplate.update(t.id, { next_due_date });
  return next_due_date;
}

// Runs are chained, never concurrent: the app runs this on open and the
// Recurring page runs it again on load/save, and two overlapping runs would
// each see the same due date and create the entry twice. Each run also
// re-reads the templates itself rather than trusting a list handed in, since
// a list fetched before an earlier run finished still carries the old due
// dates.
let queue = Promise.resolve();

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
      let iterations = 0;
      // Every occurrence missed since the last run gets its own entry on its
      // own date — three months away from the app means three rent entries,
      // not one.
      while (dueDate && dueDate <= today && iterations < MAX_CATCH_UP_PER_TEMPLATE) {
        dueDate = await generateOne({ ...t, next_due_date: dueDate }, defaultCurrency);
        generated++;
        iterations++;
      }
    }
    return generated;
  });
  // A failed run mustn't wedge every later one behind it.
  queue = run.catch(() => {});
  return run;
}
