import { test, expect } from '@playwright/test';
import { signIn } from '../mocks/signIn.js';
import { SHEET_HEADERS } from '../mocks/googleApi.js';

const CREATED = '2024-01-01T00:00:00.000Z';
const pad2 = (n) => String(n).padStart(2, '0');
const now = new Date();
const thisMonth = `${now.getFullYear()}-${pad2(now.getMonth() + 1)}`;
const prev = new Date(now.getFullYear(), now.getMonth() - 1, 1);
const lastMonth = `${prev.getFullYear()}-${pad2(prev.getMonth() + 1)}`;

// Day 01 so every seeded expense is always on or before "today", whatever
// day the suite happens to run — the burn-rate calc only counts single
// expenses already paid (see getBurnRate in src/lib/insights.js).
const thisMonthDay = `${thisMonth}-01`;
const lastMonthDay = `${lastMonth}-05`;

// The mock's Expenses header is one column short of the real schema, which
// reads by position — the trailing value is recurring_template_id.
const EXPENSE_HEADERS = [...SHEET_HEADERS.Expenses, 'recurring_template_id'];
const expense = (id, description, amount, categoryId, date, recurringTemplateId = '') => [
  id, description, amount, 'EUR', date, categoryId, 'card', '', '[]', '', 'single', '', '', '', CREATED, false, recurringTemplateId,
];

// Numbers chosen so every insight lands on a value worth asserting:
// Car is this month's top category (920) at exactly +100% over last month
// (460); the car repair is both the biggest single expense and the only
// outlier (7.5× the 120 average of the four other Car expenses); Groceries
// and Fun each have too little history to flag anything; and 75 of the
// month's 1245 is recurring.
const seed = {
  Categories: [
    SHEET_HEADERS.Categories,
    ['cat-groceries', 'Groceries', 'ShoppingCart', '#10b981', '', 0, CREATED],
    ['cat-car', 'Car', 'Car', '#0ea5e9', '', 1, CREATED],
    ['cat-fun', 'Fun', 'Music', '#f59e0b', '', 2, CREATED],
  ],
  Expenses: [
    EXPENSE_HEADERS,
    expense('e-groceries-1', 'Weekly groceries', 100, 'cat-groceries', thisMonthDay),
    expense('e-groceries-2', 'More groceries', 150, 'cat-groceries', thisMonthDay),
    expense('e-car-repair', 'Surprise car repair', 900, 'cat-car', thisMonthDay),
    expense('e-car-wash', 'Car wash', 20, 'cat-car', thisMonthDay),
    expense('e-netflix', 'Netflix', 30, 'cat-fun', thisMonthDay, 'rt-1'),
    expense('e-gym', 'Gym membership', 45, 'cat-fun', thisMonthDay, 'rt-2'),
    expense('e-fuel', 'Car fuel', 200, 'cat-car', lastMonthDay),
    expense('e-parking', 'Car parking', 160, 'cat-car', lastMonthDay),
    expense('e-service', 'Car service', 100, 'cat-car', lastMonthDay),
    expense('e-groceries-old', 'Groceries last month', 250, 'cat-groceries', lastMonthDay),
  ],
  Settings: [
    SHEET_HEADERS.Settings,
    ['settings-1', 'EUR', '', '{}', CREATED, 'monthly', ''],
  ],
};

const card = (page, title) => page.locator('div.rounded-xl.border.bg-card', { hasText: title });

test('Insights shows this month\'s biggest expense, top category, pace, outlier and recurring split', async ({ page }) => {
  await signIn(page, { seed });

  await page.getByRole('link', { name: 'Insights', exact: true }).click();
  await expect(page.getByRole('heading', { name: 'Insights' })).toBeVisible();

  const biggest = card(page, 'Biggest expense this month');
  await expect(biggest.getByText('Surprise car repair')).toBeVisible();
  await expect(biggest.getByText('900.00 EUR')).toBeVisible();

  const top = card(page, 'Top category this month');
  await expect(top.getByText('Car', { exact: true })).toBeVisible();
  await expect(top.getByText('920.00 EUR')).toBeVisible();
  await expect(top.getByText('+100% vs last month (460.00 EUR)')).toBeVisible();

  const pace = card(page, 'Spending pace');
  await expect(pace.getByText('1245.00 EUR')).toBeVisible();
  await expect(pace.getByText(/Day \d+ of \d+/)).toBeVisible();

  const unusual = card(page, 'Unusual transaction');
  await expect(unusual.getByText('Surprise car repair')).toBeVisible();
  await expect(unusual.getByText('7.5× your usual Car spend (normally around 120.00 EUR)')).toBeVisible();

  const recurring = card(page, 'Recurring vs. one-off');
  await expect(recurring.getByText('75.00 EUR')).toBeVisible();
  await expect(recurring.getByText('1170.00 EUR')).toBeVisible();
  await expect(recurring.getByText('6% of this month is already committed')).toBeVisible();
});

test('Insights is Pro-only — a free account gets the paywall instead', async ({ page }) => {
  await signIn(page, { seed, subscriptionActive: false });

  // Not exact: the free-account sidebar link's accessible name includes the
  // "PRO" badge text too, same as the Recurring link.
  await page.getByRole('link', { name: 'Insights' }).click();
  await expect(page.getByRole('heading', { name: 'Insights is a Pro feature' })).toBeVisible();
  await expect(page.getByText('Biggest expense this month')).toHaveCount(0);
});

test('a Pro account can turn an insight widget off from the dashboard customize panel', async ({ page }) => {
  await signIn(page, { seed });

  const widget = page.locator('div.rounded-xl.border.bg-card', { hasText: 'Biggest expense' });
  await expect(widget.getByText('Surprise car repair')).toBeVisible();

  await page.getByRole('button', { name: 'Customize' }).click();
  const row = page.locator('div', { hasText: 'Biggest expense' }).filter({ has: page.getByRole('switch') }).last();
  const toggle = row.getByRole('switch');
  await expect(toggle).toBeChecked();
  // A paying account sees no PRO marker next to it.
  await expect(row.getByText('PRO')).toHaveCount(0);
  await toggle.click();

  await page.getByRole('button', { name: 'Done' }).click();
  await expect(page.getByText('Biggest expense')).toHaveCount(0);
});

test('the Pro insight widgets stay off a free account\'s dashboard even when its saved layout has them on', async ({ page }) => {
  const layout = [
    { id: 'biggestExpense', visible: true },
    { id: 'topCategory', visible: true },
    { id: 'thisMonth', visible: true },
  ];
  await signIn(page, {
    subscriptionActive: false,
    seed: {
      ...seed,
      Settings: [
        SHEET_HEADERS.Settings,
        ['settings-1', 'EUR', '', '{}', CREATED, 'monthly', JSON.stringify(layout)],
      ],
    },
  });

  await expect(page.getByText('Biggest expense')).toHaveCount(0);
  await expect(page.getByText('Top category')).toHaveCount(0);
  // The non-Pro widget from the same saved layout still renders — the
  // month widget is labelled with the month's own name.
  const monthName = new Intl.DateTimeFormat('en', { month: 'long' }).format(now);
  await expect(page.getByText(monthName, { exact: true })).toBeVisible();

  // They're still listed in the customize panel (pulling them out would
  // desync the drag indices), but marked as Pro.
  await page.getByRole('button', { name: 'Customize' }).click();
  const row = page.locator('div', { hasText: 'Biggest expense' }).filter({ has: page.getByRole('switch') }).last();
  await expect(row.getByText('PRO')).toBeVisible();
});
