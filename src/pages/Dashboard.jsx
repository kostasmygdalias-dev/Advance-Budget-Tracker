import { useEffect, useState, lazy, Suspense } from 'react';
import { useNavigate, Link } from 'react-router-dom';
import { startOfWeek, endOfWeek } from 'date-fns';
import { entities, createBackupSnapshot, listBackupSnapshots } from '@/lib/sheetsStore';
import { useCategoriesQuery, useSettingsQuery, useInvalidateSettings } from '@/hooks/useEntities';
import { useSubscription } from '@/hooks/use-subscription';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from '@/components/ui/dropdown-menu';
import { Popover, PopoverTrigger, PopoverContent } from '@/components/ui/popover';
import { useToast } from '@/components/ui/use-toast';
import {
  Plus, ChevronDown, ChevronRight, ArrowUp, ArrowDown, LayoutGrid, Tag,
  Receipt, FolderTree, PiggyBank, Wallet, Coins, Bell,
} from 'lucide-react';
import {
  BarChart, Bar, XAxis, YAxis, Tooltip, Legend, ResponsiveContainer,
  PieChart, Pie, Cell,
} from 'recharts';
import {
  getMonthlyContribution, getRecentMonths, currentMonthStr, monthLabel, monthNameLong, isInMonth, parseDateLocal, fmt,
} from '@/lib/finance';
import { getIncomeSources, INCOME_SOURCE_ICONS } from '@/components/IncomeForm';
import { CategoryIcon, IconAvatar, PALETTE } from '@/lib/categoryIcons';
import { amountIncludingChildren, flattenCategoryTree } from '@/lib/categoryTree';
import CategoryMultiSelect from '@/components/CategoryMultiSelect';
import LoadError from '@/components/LoadError';
import PageSkeleton from '@/components/PageSkeleton';
import { useLanguage } from '@/lib/i18n';

const DashboardCustomizePanel = lazy(() => import('@/components/DashboardCustomizePanel'));

const INCOME_COLOR = '#10b981';

const AUTO_BACKUP_CHECK_KEY = 'expensetrack_last_auto_backup_check';
const AUTO_BACKUP_INTERVAL_MS = 7 * 24 * 60 * 60 * 1000;

const UPCOMING_RECURRING_WINDOW_DAYS = 7;

function daysUntil(dateStr) {
  if (!dateStr) return null;
  const [y, m, d] = dateStr.split('-').map(Number);
  const target = new Date(y, m - 1, d);
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  return Math.round((target - today) / 86400000);
}

// Shown instead of the (otherwise all-empty) widget grid for a brand-new
// account — a short, concrete "what to do first" instead of nine cards all
// saying "no data yet."
function OnboardingGuide() {
  const { t } = useLanguage();
  const steps = [
    { icon: Receipt, title: t('dashboard.onboarding.step1Title'), body: t('dashboard.onboarding.step1Body'), to: '/expenses/new', cta: t('dashboard.onboarding.step1Cta') },
    { icon: FolderTree, title: t('dashboard.onboarding.step2Title'), body: t('dashboard.onboarding.step2Body'), to: '/categories', cta: t('dashboard.onboarding.step2Cta') },
    { icon: PiggyBank, title: t('dashboard.onboarding.step3Title'), body: t('dashboard.onboarding.step3Body'), to: '/budgets', cta: t('dashboard.onboarding.step3Cta') },
  ];
  return (
    <Card className="p-6 sm:p-8">
      <div className="flex items-center gap-3 mb-2">
        <div className="w-10 h-10 rounded-xl bg-primary/10 flex items-center justify-center shrink-0">
          <Wallet className="w-5 h-5 text-primary" />
        </div>
        <div>
          <p className="font-heading font-semibold text-lg">{t('dashboard.onboarding.title')}</p>
          <p className="text-sm text-muted-foreground">{t('dashboard.onboarding.subtitle')}</p>
        </div>
      </div>
      <div className="grid gap-4 sm:grid-cols-3 mt-6">
        {steps.map((s, i) => (
          <div key={i} className="flex flex-col gap-2 p-4 rounded-lg border">
            <s.icon className="w-5 h-5 text-muted-foreground" />
            <p className="text-sm font-medium">{s.title}</p>
            <p className="text-xs text-muted-foreground flex-1">{s.body}</p>
            <Link to={s.to}>
              <Button variant="outline" size="sm" className="w-full mt-1">{s.cta}</Button>
            </Link>
          </div>
        ))}
      </div>
    </Card>
  );
}

// Every widget the dashboard can show — "span: full" takes the whole row,
// "half" shares a row with another half-width widget. This is the single
// source of truth for both the customize panel (all of them, in order) and
// the actual grid (only the visible ones). Labels come from
// t('dashboard.widgets.<id>') wherever they're displayed.
const WIDGET_DEFS = [
  { id: 'thisMonth', span: 'half' },
  { id: 'lastMonth', span: 'half' },
  { id: 'recentTransactions', span: 'full' },
  { id: 'budget', span: 'half' },
  { id: 'categoryBudgets', span: 'full' },
  { id: 'avgSpent', span: 'half' },
  { id: 'trend', span: 'full' },
  { id: 'categoryPie', span: 'half' },
  { id: 'sourcePie', span: 'half' },
];
const WIDGET_IDS = WIDGET_DEFS.map((w) => w.id);
const DEFAULT_LAYOUT = WIDGET_DEFS.map((w) => ({ id: w.id, visible: true }));

// Merges a saved layout with the widget registry — drops ids that no longer
// exist, and appends any new widgets (shipped after the user last
// customized) as visible, so a future addition doesn't silently vanish for
// people who've already saved a layout.
function normalizeLayout(saved) {
  if (!saved || !Array.isArray(saved)) return DEFAULT_LAYOUT;
  const known = saved.filter((w) => WIDGET_IDS.includes(w.id));
  const knownIds = new Set(known.map((w) => w.id));
  WIDGET_DEFS.forEach((w) => {
    if (!knownIds.has(w.id)) known.push({ id: w.id, visible: true });
  });
  return known;
}

// Numbers-and-a-graph only, no explanatory labels — the month name is the
// only text. The donut is just income vs. expenses split. Clicking it goes
// to that specific month's transactions.
function MonthWidget({ label, month, income, expenses, currency }) {
  const net = income - expenses;
  const total = income + expenses;
  const data = total > 0
    ? [{ name: 'income', value: income }, { name: 'expenses', value: expenses }]
    : [{ name: 'empty', value: 1 }];
  const colors = total > 0 ? ['#10b981', '#ef4444'] : ['#e5e7eb'];

  return (
    <Link to={`/transactions?month=${month}`} className="block group h-full">
      <Card className="p-5 h-full transition-colors group-hover:border-foreground/20">
        <p className="text-sm font-medium mb-3">{label}</p>
        <div className="flex items-center gap-5">
          <div className="w-20 h-20 shrink-0">
            <ResponsiveContainer width="100%" height="100%">
              <PieChart>
                <Pie data={data} dataKey="value" innerRadius={26} outerRadius={40} startAngle={90} endAngle={-270} paddingAngle={total > 0 ? 3 : 0}>
                  {data.map((d, i) => <Cell key={i} fill={colors[i]} />)}
                </Pie>
              </PieChart>
            </ResponsiveContainer>
          </div>
          <div className="space-y-1.5">
            <p className="flex items-center gap-1.5 text-emerald-600 font-semibold tabular-nums">
              <ArrowUp className="w-3.5 h-3.5" /> {fmt(income, currency)}
            </p>
            <p className="flex items-center gap-1.5 text-destructive font-semibold tabular-nums">
              <ArrowDown className="w-3.5 h-3.5" /> {fmt(expenses, currency)}
            </p>
            <p className={`font-semibold tabular-nums pt-1.5 border-t ${net >= 0 ? 'text-emerald-600' : 'text-destructive'}`}>
              {net >= 0 ? '+' : ''}{fmt(net, currency)}
            </p>
          </div>
        </div>
      </Card>
    </Link>
  );
}

// The whole card is a link to Transactions — a summary widget, not a place
// to edit from, so one click target for the row is enough.
function RecentTransactions({ rows, catMap }) {
  const { t } = useLanguage();
  // month=all: this list isn't scoped to the current month, so the newest
  // entry shown here could be from last month — the default current-month
  // view on Transactions could otherwise hide exactly what was just clicked.
  return (
    <Link to="/transactions?month=all" className="block group">
      <Card className="p-5 transition-colors group-hover:border-foreground/20">
        <div className="flex items-center justify-between mb-3">
          <p className="text-sm font-medium">{t('dashboard.widgets.recentTransactions')}</p>
          <ChevronRight className="w-4 h-4 text-muted-foreground transition-transform group-hover:translate-x-0.5" />
        </div>
        {rows.length === 0 ? (
          <p className="text-sm text-muted-foreground">{t('dashboard.nothingRecordedYet')}</p>
        ) : (
          <div className="space-y-3">
            {rows.map((row) => {
              const isIncome = row._type === 'income';
              const cat = !isIncome && row.category_id ? catMap[row.category_id] : null;
              const color = isIncome ? INCOME_COLOR : (cat?.color || '#94a3b8');
              const Icon = isIncome ? (INCOME_SOURCE_ICONS[row.source] || INCOME_SOURCE_ICONS.other) : null;
              return (
                <div key={row.id} className="flex items-center gap-3">
                  {isIncome ? (
                    <IconAvatar icon={Icon} color={color} className="w-8 h-8" />
                  ) : (
                    <IconAvatar icon={(props) => <CategoryIcon name={cat?.icon} {...props} />} color={color} className="w-8 h-8" />
                  )}
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-medium truncate">{row.description}</p>
                    <p className="text-xs text-muted-foreground">{row._date}</p>
                  </div>
                  <span className={`text-sm font-semibold tabular-nums ${isIncome ? 'text-emerald-600' : ''}`}>
                    {isIncome ? '+' : ''}{fmt(row.amount, row.currency)}
                  </span>
                </div>
              );
            })}
          </div>
        )}
      </Card>
    </Link>
  );
}

// One row per category that actually has a budget set — sorted worst-first
// (closest to or over budget) so whatever needs attention is at the top,
// not buried below categories nowhere near their limit. Links to the full
// Budgets page, same "whole card is the click target" pattern as the other
// summary widgets.
function CategoryBudgets({ rows, currency }) {
  const { t } = useLanguage();
  return (
    <Link to="/budgets" className="block group">
      <Card className="p-5 transition-colors group-hover:border-foreground/20">
        <div className="flex items-center justify-between mb-3">
          <p className="text-sm font-medium">{t('dashboard.widgets.categoryBudgets')}</p>
          <ChevronRight className="w-4 h-4 text-muted-foreground transition-transform group-hover:translate-x-0.5" />
        </div>
        {rows.length === 0 ? (
          <p className="text-sm text-muted-foreground">{t('dashboard.noCategoryBudgetsYet')}</p>
        ) : (
          <div className="space-y-3">
            {rows.map((r) => (
              <div key={r.id} className="flex items-center gap-3">
                <IconAvatar icon={(props) => <CategoryIcon name={r.icon} {...props} />} color={r.color} className="w-8 h-8" />
                <div className="flex-1 min-w-0">
                  <div className="flex items-center justify-between gap-2 mb-1">
                    <p className="text-sm font-medium truncate">{r.name}</p>
                    <span className="text-xs text-muted-foreground tabular-nums shrink-0">{fmt(r.spent, currency)} / {fmt(r.budget, currency)}</span>
                  </div>
                  <div className="h-1.5 rounded-full bg-muted overflow-hidden">
                    <div
                      className="h-full rounded-full"
                      style={{ width: `${Math.min(100, r.pct)}%`, background: r.pct >= 100 ? '#ef4444' : r.color }}
                    />
                  </div>
                </div>
              </div>
            ))}
          </div>
        )}
      </Card>
    </Link>
  );
}

// Below this many uncategorized expenses in the current month, the banner
// stays hidden — a stray one or two isn't worth nagging about.
const UNCATEGORIZED_ALERT_THRESHOLD = 3;

// Which budget overages we've already toasted about, per calendar month — so
// the alert fires once per overage, not on every single page visit. Keeps
// only the last few months so this doesn't grow forever.
const ALERT_KEY = 'expensetrack_budget_alerts_v1';

function getAlertedSet(monthKey) {
  try {
    const stored = JSON.parse(localStorage.getItem(ALERT_KEY) || '{}');
    return new Set(stored[monthKey] || []);
  } catch {
    return new Set();
  }
}

function markAlerted(monthKey, ids) {
  try {
    const stored = JSON.parse(localStorage.getItem(ALERT_KEY) || '{}');
    const existing = new Set(stored[monthKey] || []);
    ids.forEach((id) => existing.add(id));
    stored[monthKey] = [...existing];
    const months = Object.keys(stored).sort();
    while (months.length > 3) delete stored[months.shift()];
    localStorage.setItem(ALERT_KEY, JSON.stringify(stored));
  } catch {
    // localStorage unavailable (private browsing, etc.) — alerts just won't be throttled across visits.
  }
}

export default function Dashboard() {
  const navigate = useNavigate();
  const { toast } = useToast();
  const { t, lang } = useLanguage();
  const incomeSources = getIncomeSources(t);
  const [expenses, setExpenses] = useState([]);
  const [incomes, setIncomes] = useState([]);
  const [txLoading, setTxLoading] = useState(true);
  const [txError, setTxError] = useState(null);
  const [layout, setLayout] = useState(DEFAULT_LAYOUT);
  const [customizing, setCustomizing] = useState(false);
  const [focusCategoryIds, setFocusCategoryIds] = useState([]);
  const { active: subActive } = useSubscription();
  const [recurringTemplates, setRecurringTemplates] = useState([]);

  // Recurring templates are a Pro feature on their own (see Recurring.jsx),
  // so due-date reminders about them only make sense — and are only
  // fetched — for an active subscriber.
  useEffect(() => {
    if (!subActive) return;
    entities.RecurringTemplate.list().then(setRecurringTemplates).catch(() => {});
  }, [subActive]);

  // Categories and Settings are cached across pages (see useEntities) —
  // only expenses/incomes are fetched fresh here, since they change often
  // and this page's own toasts/optimistic bits assume plain local state.
  const catQuery = useCategoriesQuery();
  const setQuery = useSettingsQuery();
  const invalidateSettings = useInvalidateSettings();
  const categories = catQuery.data || [];
  const settings = setQuery.data?.[0] || null;
  const loading = txLoading || catQuery.isLoading || setQuery.isLoading;
  const loadError = txError || catQuery.error || setQuery.error;

  const load = () => {
    setTxLoading(true);
    setTxError(null);
    (async () => {
      try {
        const [exp, inc] = await Promise.all([
          entities.Expense.list('-paid_date', 500),
          entities.Income.list('-received_date', 500),
        ]);
        setExpenses(exp);
        setIncomes(inc);
      } catch (err) {
        setTxError(err);
      } finally {
        setTxLoading(false);
      }
    })();
  };

  const retryAll = () => {
    load();
    catQuery.refetch();
    setQuery.refetch();
  };

  useEffect(load, []);

  useEffect(() => {
    if (settings) setLayout(normalizeLayout(settings.dashboard_layout));
  }, [settings]);

  // Best-effort, silent, throttled to roughly once a week per device (via
  // localStorage) — checks whether the newest snapshot is stale before
  // writing a new one, so several devices sharing an account don't each
  // spam their own weekly backup. Never surfaces a failure to the user;
  // Settings' "Back up now" is the explicit, visible way to do this.
  useEffect(() => {
    if (loading) return;
    const lastCheck = Number(localStorage.getItem(AUTO_BACKUP_CHECK_KEY) || 0);
    if (Date.now() - lastCheck < AUTO_BACKUP_INTERVAL_MS) return;
    localStorage.setItem(AUTO_BACKUP_CHECK_KEY, String(Date.now()));
    (async () => {
      try {
        const existing = await listBackupSnapshots();
        const newest = existing[0]?.created_date;
        if (!newest || Date.now() - new Date(newest).getTime() > AUTO_BACKUP_INTERVAL_MS) {
          await createBackupSnapshot();
        }
      } catch {
        // Silent — Settings' manual "Back up now" is the visible fallback.
      }
    })();
  }, [loading]);

  const persistLayout = async (next) => {
    setLayout(next);
    if (!settings) return;
    try {
      await entities.Settings.update(settings.id, { dashboard_layout: next });
      invalidateSettings();
    } catch (err) {
      toast({ title: t('dashboard.couldNotSaveLayout'), description: err.message, variant: 'destructive' });
    }
  };

  const toggleWidget = (id) => {
    persistLayout(layout.map((w) => (w.id === id ? { ...w, visible: !w.visible } : w)));
  };

  const onDragEnd = (result) => {
    if (!result.destination || result.destination.index === result.source.index) return;
    const next = Array.from(layout);
    const [moved] = next.splice(result.source.index, 1);
    next.splice(result.destination.index, 0, moved);
    persistLayout(next);
  };

  const catMap = {};
  categories.forEach((c) => { catMap[c.id] = c; });

  const months = getRecentMonths(6);
  const thisMonth = currentMonthStr();
  const currency = settings?.default_currency || 'EUR';

  // Every aggregate below is scoped to the default currency. Summing raw
  // amounts across currencies (e.g. some expenses in EUR, some in USD)
  // would silently produce a meaningless number — there's no conversion
  // rate available without a paid FX API, so other-currency transactions
  // are excluded here; otherCurrencyCount (below) surfaces that via a banner.
  const trendData = months.map((m) => ({
    month: monthLabel(m, lang),
    income: incomes.reduce((s, i) => s + ((i.currency || 'EUR') === currency && isInMonth(i.received_date, m) ? i.amount || 0 : 0), 0),
    expenses: expenses.reduce((s, e) => s + ((e.currency || 'EUR') === currency ? getMonthlyContribution(e, m) : 0), 0),
  }));
  const currentExpenseTotal = expenses.reduce((s, e) => s + ((e.currency || 'EUR') === currency ? getMonthlyContribution(e, thisMonth) : 0), 0);
  const currentIncomeTotal = incomes.reduce((s, i) => s + ((i.currency || 'EUR') === currency && isInMonth(i.received_date, thisMonth) ? i.amount || 0 : 0), 0);

  const uncategorizedCount = expenses.filter((e) =>
    !e.category_id && (e.currency || 'EUR') === currency && getMonthlyContribution(e, thisMonth) > 0
  ).length;

  const otherCurrencyCount =
    expenses.filter((e) => (e.currency || 'EUR') !== currency && getMonthlyContribution(e, thisMonth) > 0).length +
    incomes.filter((i) => (i.currency || 'EUR') !== currency && isInMonth(i.received_date, thisMonth)).length;

  const upcomingRecurring = recurringTemplates
    .filter((rt) => rt.active)
    .map((rt) => ({ ...rt, daysUntil: daysUntil(rt.next_due_date) }))
    .filter((rt) => rt.daysUntil !== null && rt.daysUntil >= 0 && rt.daysUntil <= UPCOMING_RECURRING_WINDOW_DAYS)
    .sort((a, b) => a.daysUntil - b.daysUntil);

  const recentTransactions = [
    ...expenses.map((e) => ({ ...e, _type: 'expense', _date: e.paid_date })),
    ...incomes.map((i) => ({ ...i, _type: 'income', _date: i.received_date })),
  ]
    .sort((a, b) => (b._date || '').localeCompare(a._date || ''))
    .slice(0, 5);

  const [lastMonth] = getRecentMonths(2);
  const lastMonthExpenseTotal = expenses.reduce((s, e) => s + ((e.currency || 'EUR') === currency ? getMonthlyContribution(e, lastMonth) : 0), 0);
  const lastMonthIncomeTotal = incomes.reduce((s, i) => s + ((i.currency || 'EUR') === currency && isInMonth(i.received_date, lastMonth) ? i.amount || 0 : 0), 0);

  const byCategory = {};
  const byCategoryCounts = {};
  expenses.forEach((e) => {
    if ((e.currency || 'EUR') !== currency) return;
    const contrib = getMonthlyContribution(e, thisMonth);
    if (contrib <= 0) return;
    const key = e.category_id || 'uncategorized';
    byCategory[key] = (byCategory[key] || 0) + contrib;
    byCategoryCounts[key] = (byCategoryCounts[key] || 0) + 1;
  });

  // Same parent-rollup + multi-select drill-down as Reports' "Spending by
  // category" card (see CategoryMultiSelect there) — this month only,
  // instead of a date range, since that's this widget's whole point.
  const categoryReport = [];
  let currentCategoryGroup = null;
  flattenCategoryTree(categories).forEach((c) => {
    if (c.depth === 0) {
      const total = amountIncludingChildren(c.id, byCategory, categories);
      currentCategoryGroup = total > 0 ? {
        id: c.id, name: c.name, color: c.color || PALETTE[0], icon: c.icon,
        total, count: byCategoryCounts[c.id] || 0, children: [],
      } : null;
      if (currentCategoryGroup) categoryReport.push(currentCategoryGroup);
    } else if (currentCategoryGroup && byCategory[c.id] > 0) {
      currentCategoryGroup.count += byCategoryCounts[c.id] || 0;
      currentCategoryGroup.children.push({
        id: c.id, name: c.name, color: c.color || PALETTE[0], icon: c.icon,
        total: byCategory[c.id], count: byCategoryCounts[c.id] || 0,
      });
    }
  });
  if (byCategory.uncategorized > 0) {
    categoryReport.push({
      id: 'uncategorized', name: t('transactions.uncategorized'), color: '#94a3b8', icon: null,
      total: byCategory.uncategorized, count: byCategoryCounts.uncategorized || 0, children: [],
    });
  }
  categoryReport.sort((a, b) => b.total - a.total);
  categoryReport.forEach((g) => g.children.sort((a, b) => b.total - a.total));
  const categoryFocusEntries = categoryReport.flatMap((g) => [
    { id: g.id, name: g.name, depth: 0 },
    ...g.children.map((c) => ({ id: c.id, name: c.name, depth: 1 })),
  ]);

  const categoryFocusIdSet = new Set();
  focusCategoryIds.forEach((id) => {
    const group = categoryReport.find((g) => g.id === id);
    if (group) {
      categoryFocusIdSet.add(group.id);
      group.children.forEach((c) => categoryFocusIdSet.add(c.id));
    } else {
      categoryFocusIdSet.add(id);
    }
  });
  const categoryFocusSelected = categoryReport.flatMap((g) => [g, ...g.children]).filter((e) => focusCategoryIds.includes(e.id));
  const categoryFocusEntry = categoryFocusIdSet.size > 0 ? {
    name: categoryFocusSelected.length === 1 ? categoryFocusSelected[0].name : t('reports.categoriesSelected', { count: categoryFocusSelected.length }),
    icon: categoryFocusSelected.length === 1 ? categoryFocusSelected[0].icon : null,
    color: categoryFocusSelected.length === 1 ? categoryFocusSelected[0].color : PALETTE[0],
    total: [...categoryFocusIdSet].reduce((s, id) => s + (byCategory[id] || 0), 0),
  } : null;
  const categoryFocusHasGroup = focusCategoryIds.some((id) => categoryReport.some((g) => g.id === id));
  const categoryFocusRows = (() => {
    const rows = [];
    const seen = new Set();
    focusCategoryIds.forEach((id) => {
      const group = categoryReport.find((g) => g.id === id);
      if (group) {
        group.children.forEach((c) => { if (!seen.has(c.id)) { rows.push(c); seen.add(c.id); } });
      } else {
        const child = categoryReport.flatMap((g) => g.children).find((c) => c.id === id);
        if (child && !seen.has(child.id)) { rows.push(child); seen.add(child.id); }
      }
    });
    return rows.sort((a, b) => b.total - a.total);
  })();

  const categoryBudgetRows = Object.entries(settings?.budget_per_category || {})
    .filter(([, amt]) => amt > 0)
    .map(([catId, amt]) => {
      const spent = amountIncludingChildren(catId, byCategory, categories);
      return {
        id: catId,
        name: catId === 'uncategorized' ? t('transactions.uncategorized') : (catMap[catId]?.name || t('common.categoryFallback')),
        icon: catMap[catId]?.icon,
        color: catId === 'uncategorized' ? '#94a3b8' : (catMap[catId]?.color || PALETTE[0]),
        spent, budget: amt,
        pct: amt > 0 ? (spent / amt) * 100 : 0,
      };
    })
    .sort((a, b) => b.pct - a.pct);

  const bySource = {};
  incomes.forEach((i) => {
    if ((i.currency || 'EUR') !== currency) return;
    if (!isInMonth(i.received_date, thisMonth)) return;
    const key = i.source || 'other';
    bySource[key] = (bySource[key] || 0) + (i.amount || 0);
  });
  const incomePieData = Object.entries(bySource)
    .map(([source, value], idx) => ({
      name: incomeSources.find((s) => s.value === source)?.label || source,
      value: Math.round(value * 100) / 100,
      color: PALETTE[idx % PALETTE.length],
    }))
    .sort((a, b) => b.value - a.value);

  const budget = settings?.monthly_budget_total;
  const budgetPeriod = settings?.budget_period || 'monthly';
  const now = new Date();
  const periodStart = budgetPeriod === 'weekly' ? startOfWeek(now, { weekStartsOn: 1 }) : new Date(now.getFullYear(), now.getMonth(), 1);
  const periodEnd = budgetPeriod === 'weekly'
    ? endOfWeek(now, { weekStartsOn: 1 })
    : new Date(now.getFullYear(), now.getMonth() + 1, 0, 23, 59, 59, 999);
  const periodKey = budgetPeriod === 'weekly' ? periodStart.toISOString().slice(0, 10) : thisMonth;

  // Amortized expenses spread a purchase across months via getMonthlyContribution
  // — that's a monthly-granularity concept, so weekly mode only counts plain
  // single expenses whose paid_date actually falls in the current week.
  const budgetPeriodExpenseTotal = budgetPeriod === 'weekly'
    ? expenses.reduce((s, e) => {
        if ((e.currency || 'EUR') !== currency || e.expense_type === 'amortized' || !e.paid_date) return s;
        const d = parseDateLocal(e.paid_date);
        return d >= periodStart && d <= periodEnd ? s + (e.amount || 0) : s;
      }, 0)
    : currentExpenseTotal;

  const budgetPct = budget > 0 ? Math.min(100, (budgetPeriodExpenseTotal / budget) * 100) : 0;
  const periodProgressPct = Math.min(100, Math.max(0, ((now - periodStart) / (periodEnd - periodStart)) * 100));

  // Toasts once per budget that goes over, per period — not on every load.
  useEffect(() => {
    if (!settings || loading) return;
    const alerted = getAlertedSet(periodKey);
    const newlyOver = [];
    const messages = [];

    if (budget > 0 && budgetPeriodExpenseTotal >= budget && !alerted.has('total')) {
      newlyOver.push('total');
      messages.push(budgetPeriod === 'weekly'
        ? t('dashboard.reachedBudgetWeekly', { amount: fmt(budget, currency) })
        : t('dashboard.reachedBudgetMonthly', { amount: fmt(budget, currency) }));
    }

    Object.entries(settings.budget_per_category || {}).forEach(([catId, catBudget]) => {
      if (!catBudget || catBudget <= 0) return;
      const spent = amountIncludingChildren(catId, byCategory, categories);
      if (spent >= catBudget && !alerted.has(catId)) {
        newlyOver.push(catId);
        messages.push(t('dashboard.categoryOverBudget', { category: catMap[catId]?.name || t('dashboard.aCategory'), amount: fmt(catBudget, currency) }));
      }
    });

    if (newlyOver.length > 0) {
      toast({
        title: newlyOver.length === 1 ? t('dashboard.budgetExceededOne') : t('dashboard.budgetExceededOther', { count: newlyOver.length }),
        description: messages.join(' '),
        variant: 'destructive',
      });
      markAlerted(periodKey, newlyOver);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [settings, loading, budgetPeriodExpenseTotal, budget, periodKey, currency]);

  if (loading) return <PageSkeleton rows={4} />;
  if (loadError) return <LoadError error={loadError} onRetry={retryAll} />;

  const renderWidget = (id) => {
    switch (id) {
      case 'thisMonth':
        return <MonthWidget label={monthNameLong(thisMonth, lang)} month={thisMonth} income={currentIncomeTotal} expenses={currentExpenseTotal} currency={currency} />;
      case 'lastMonth':
        return <MonthWidget label={monthNameLong(lastMonth, lang)} month={lastMonth} income={lastMonthIncomeTotal} expenses={lastMonthExpenseTotal} currency={currency} />;
      case 'recentTransactions':
        return <RecentTransactions rows={recentTransactions} catMap={catMap} />;
      case 'budget':
        return (
          <Link to="/budgets" className="block group h-full">
            <Card className="p-5 h-full transition-colors group-hover:border-foreground/20">
              <p className="text-sm text-muted-foreground">{budgetPeriod === 'weekly' ? t('dashboard.weeklyBudget') : t('dashboard.monthlyBudget')}</p>
              <p className="text-3xl font-heading font-semibold mt-1 tabular-nums">
                {budget ? fmt(budget, currency) : '—'}
              </p>
              {budget > 0 && (
                <div className="mt-3">
                  <div className="relative h-2 rounded-full bg-muted overflow-hidden">
                    <div
                      className="h-full rounded-full transition-all"
                      style={{ width: `${budgetPct}%`, background: budgetPct >= 100 ? '#ef4444' : '#0f172a' }}
                    />
                    <div className="absolute top-0 bottom-0 w-0.5 bg-foreground/40" style={{ left: `${periodProgressPct}%` }} title={t('dashboard.today')} />
                  </div>
                  <p className="text-xs text-muted-foreground mt-1">
                    {budgetPeriod === 'weekly'
                      ? t('dashboard.usedThroughWeek', { pct: budgetPct.toFixed(0), progress: periodProgressPct.toFixed(0) })
                      : t('dashboard.usedThroughMonth', { pct: budgetPct.toFixed(0), progress: periodProgressPct.toFixed(0) })}
                  </p>
                </div>
              )}
            </Card>
          </Link>
        );
      case 'categoryBudgets':
        return <CategoryBudgets rows={categoryBudgetRows} currency={currency} />;
      case 'avgSpent':
        return (
          <Card className="p-5 h-full">
            <p className="text-sm text-muted-foreground">{t('dashboard.avgSpentPerMonth')}</p>
            <p className="text-3xl font-heading font-semibold mt-1 tabular-nums">
              {fmt(trendData.reduce((s, d) => s + d.expenses, 0) / Math.max(1, trendData.length), currency)}
            </p>
          </Card>
        );
      case 'trend':
        return (
          <Card className="p-5">
            <div className="flex items-center justify-between mb-4">
              <p className="text-sm font-medium">{t('dashboard.monthlyTrendTitle')}</p>
              <Link to="/reports" className="text-xs text-muted-foreground hover:text-foreground underline">
                {t('dashboard.viewReports')}
              </Link>
            </div>
            <div className="h-64">
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={trendData} margin={{ top: 4, right: 8, bottom: 4, left: 8 }}>
                  <XAxis dataKey="month" tick={{ fontSize: 12 }} tickLine={false} axisLine={false} />
                  <YAxis tick={{ fontSize: 12 }} tickLine={false} axisLine={false} width={48} />
                  <Tooltip
                    formatter={(v) => fmt(v, currency)}
                    cursor={{ fill: 'hsl(var(--muted))' }}
                    contentStyle={{ borderRadius: 8, border: '1px solid hsl(var(--border))' }}
                  />
                  <Legend wrapperStyle={{ fontSize: 12 }} />
                  <Bar dataKey="income" name={t('common.income')} fill="#10b981" radius={[4, 4, 0, 0]} />
                  <Bar dataKey="expenses" name={t('common.expense')} fill="#0f172a" radius={[4, 4, 0, 0]} />
                </BarChart>
              </ResponsiveContainer>
            </div>
          </Card>
        );
      case 'categoryPie':
        return (
          <Card className="p-5 h-full">
            <div className="flex items-center justify-between gap-3 mb-4 flex-wrap">
              <p className="text-sm font-medium">{t('dashboard.spendingByCategoryFor', { month: monthLabel(thisMonth, lang) })}</p>
              {categoryReport.length > 0 && (
                <CategoryMultiSelect
                  entries={categoryFocusEntries}
                  selectedIds={focusCategoryIds}
                  onToggle={(id) => setFocusCategoryIds((prev) => (prev.includes(id) ? prev.filter((x) => x !== id) : [...prev, id]))}
                  onClear={() => setFocusCategoryIds([])}
                  allLabel={t('reports.allCategories')}
                  selectedLabel={(count) => t('reports.categoriesSelected', { count })}
                  clearLabel={t('reports.clearSelection')}
                  triggerClassName="h-8 text-xs w-40 justify-between font-normal"
                />
              )}
            </div>
            {categoryReport.length === 0 ? (
              <p className="text-sm text-muted-foreground">{t('dashboard.noSpendingThisMonth')}</p>
            ) : categoryFocusEntry ? (
              <div className="space-y-4">
                <div className="flex items-center gap-3">
                  <IconAvatar icon={(props) => <CategoryIcon name={categoryFocusEntry.icon} {...props} />} color={categoryFocusEntry.color} className="w-10 h-10" />
                  <div>
                    <p className="text-sm font-medium">{categoryFocusEntry.name}</p>
                    <p className="text-2xl font-heading font-semibold tabular-nums">{fmt(categoryFocusEntry.total, currency)}</p>
                  </div>
                </div>
                {categoryFocusHasGroup && (
                  categoryFocusRows.length === 0 ? (
                    <p className="text-sm text-muted-foreground">{t('reports.noSubcategorySpending')}</p>
                  ) : (
                    <div className="space-y-2">
                      {categoryFocusRows.map((c) => (
                        <div key={c.id} className="flex items-center gap-3 text-sm">
                          <IconAvatar icon={(props) => <CategoryIcon name={c.icon} {...props} />} color={c.color} className="w-7 h-7" />
                          <span className="flex-1 min-w-0 truncate">{c.name}</span>
                          <span className="text-xs text-muted-foreground">{c.count}×</span>
                          <span className="tabular-nums font-medium w-20 text-right">{fmt(c.total, currency)}</span>
                        </div>
                      ))}
                    </div>
                  )
                )}
              </div>
            ) : (
              <div className="grid sm:grid-cols-2 gap-4 items-center">
                <div className="h-56">
                  <ResponsiveContainer width="100%" height="100%">
                    <PieChart>
                      <Pie data={categoryReport} dataKey="total" nameKey="name" innerRadius={50} outerRadius={80} paddingAngle={2}>
                        {categoryReport.map((d, i) => <Cell key={i} fill={d.color} />)}
                      </Pie>
                      <Tooltip formatter={(v) => fmt(v, currency)} />
                    </PieChart>
                  </ResponsiveContainer>
                </div>
                <div className="space-y-2 max-h-56 overflow-y-auto pr-1">
                  {categoryReport.map((d) => (
                    <div key={d.id} className="space-y-1">
                      <div className="flex items-center gap-2 text-sm">
                        <span className="w-3 h-3 rounded-full shrink-0" style={{ background: d.color }} />
                        <span className="flex-1 min-w-0 truncate">{d.name}</span>
                        <span className="tabular-nums font-medium">{fmt(d.total, currency)}</span>
                      </div>
                      {d.children.map((c) => (
                        <div key={c.id} className="flex items-center gap-2 text-xs text-muted-foreground ml-5 pl-2 border-l">
                          <span className="flex-1 min-w-0 truncate">{c.name}</span>
                          <span className="tabular-nums">{fmt(c.total, currency)}</span>
                        </div>
                      ))}
                    </div>
                  ))}
                </div>
              </div>
            )}
          </Card>
        );
      case 'sourcePie':
        return (
          <Card className="p-5 h-full">
            <p className="text-sm font-medium mb-4">{t('dashboard.incomeBySourceFor', { month: monthLabel(thisMonth, lang) })}</p>
            {incomePieData.length === 0 ? (
              <p className="text-sm text-muted-foreground">{t('dashboard.noIncomeThisMonth')}</p>
            ) : (
              <div className="grid sm:grid-cols-2 gap-4 items-center">
                <div className="h-56">
                  <ResponsiveContainer width="100%" height="100%">
                    <PieChart>
                      <Pie data={incomePieData} dataKey="value" nameKey="name" innerRadius={50} outerRadius={80} paddingAngle={2}>
                        {incomePieData.map((d, i) => <Cell key={i} fill={d.color} />)}
                      </Pie>
                      <Tooltip formatter={(v) => fmt(v, currency)} />
                    </PieChart>
                  </ResponsiveContainer>
                </div>
                <div className="space-y-2">
                  {incomePieData.map((d, i) => (
                    <div key={i} className="flex items-center justify-between text-sm">
                      <span className="flex items-center gap-2">
                        <span className="w-3 h-3 rounded-full" style={{ background: d.color }} />
                        {d.name}
                      </span>
                      <span className="tabular-nums font-medium">{fmt(d.value, currency)}</span>
                    </div>
                  ))}
                </div>
              </div>
            )}
          </Card>
        );
      default:
        return null;
    }
  };

  const visibleWidgets = layout.filter((w) => w.visible);
  const isEmpty = expenses.length === 0 && incomes.length === 0;

  return (
    <div className="space-y-8">
      <div className="flex items-center justify-between flex-wrap gap-3">
        <div>
          <h1 className="text-2xl font-heading font-semibold tracking-tight">{t('dashboard.title')}</h1>
          <p className="text-sm text-muted-foreground">{monthLabel(thisMonth, lang)}</p>
        </div>
        <div className="flex items-center gap-2">
          {subActive && upcomingRecurring.length > 0 && (
            <Popover>
              <PopoverTrigger asChild>
                <Button variant="outline" size="icon" className="relative" aria-label={t('dashboard.upcomingRecurringOther', { count: upcomingRecurring.length })}>
                  <Bell className="w-4 h-4" />
                  <span className="absolute -top-1.5 -right-1.5 min-w-[18px] h-[18px] px-1 rounded-full bg-primary text-primary-foreground text-[10px] font-semibold flex items-center justify-center">
                    {upcomingRecurring.length}
                  </span>
                </Button>
              </PopoverTrigger>
              <PopoverContent className="w-72 p-3" align="end">
                <p className="text-sm font-medium mb-2">
                  {upcomingRecurring.length === 1
                    ? t('dashboard.upcomingRecurringOne')
                    : t('dashboard.upcomingRecurringOther', { count: upcomingRecurring.length })}
                </p>
                <div className="space-y-1">
                  {upcomingRecurring.slice(0, 6).map((rt) => (
                    <div key={rt.id} className="flex items-center justify-between gap-3 text-sm">
                      <span className="truncate">{rt.description}</span>
                      <span className="text-xs text-muted-foreground shrink-0">
                        {rt.daysUntil === 0 ? t('dashboard.dueToday')
                          : rt.daysUntil === 1 ? t('dashboard.dueTomorrow')
                            : t('dashboard.dueInDays', { days: rt.daysUntil })}
                      </span>
                    </div>
                  ))}
                </div>
                <Link to="/recurring" className="text-xs text-muted-foreground underline block mt-2">{t('dashboard.viewRecurring')}</Link>
              </PopoverContent>
            </Popover>
          )}
          {!isEmpty && (
            <Button variant="outline" onClick={() => setCustomizing((c) => !c)}>
              <LayoutGrid className="w-4 h-4 mr-1" /> {t('dashboard.customize')}
            </Button>
          )}
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button><Plus className="w-4 h-4 mr-1" /> {t('common.add')} <ChevronDown className="w-4 h-4 ml-1" /></Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end">
              <DropdownMenuItem onSelect={() => navigate('/income/new')}>{t('common.income')}</DropdownMenuItem>
              <DropdownMenuItem onSelect={() => navigate('/expenses/new')}>{t('common.expense')}</DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
        </div>
      </div>

      {isEmpty ? (
        <OnboardingGuide />
      ) : (
        <>
          {uncategorizedCount >= UNCATEGORIZED_ALERT_THRESHOLD && (
            <Card className="p-4 flex items-center justify-between gap-3 flex-wrap">
              <div className="flex items-center gap-3 text-amber-600">
                <Tag className="w-5 h-5 shrink-0" />
                <p className="text-sm text-foreground">
                  <span className="font-medium">{t('dashboard.uncategorizedBanner', { count: uncategorizedCount })}</span> {t('dashboard.uncategorizedBannerSuffix')}
                </p>
              </div>
              <Link to={`/transactions?type=expense&month=${thisMonth}&category=uncategorized`}>
                <Button variant="outline" size="sm">{t('dashboard.reviewNow')}</Button>
              </Link>
            </Card>
          )}

          {otherCurrencyCount > 0 && (
            <Card className="p-4 flex items-center gap-3 flex-wrap text-muted-foreground">
              <Coins className="w-5 h-5 shrink-0" />
              <p className="text-sm">
                {otherCurrencyCount === 1
                  ? t('dashboard.otherCurrenciesNoteOne', { currency, count: otherCurrencyCount })
                  : t('dashboard.otherCurrenciesNoteOther', { currency, count: otherCurrencyCount })}{' '}
                <Link to="/transactions?month=all" className="underline">{t('dashboard.viewThem')}</Link>.
              </p>
            </Card>
          )}

          {customizing && (
            <Suspense fallback={<Card className="p-4 h-32 animate-pulse bg-muted/30" />}>
              <DashboardCustomizePanel
                layout={layout}
                onDragEnd={onDragEnd}
                onToggleWidget={toggleWidget}
                onDone={() => setCustomizing(false)}
              />
            </Suspense>
          )}

          <div className="grid gap-4 sm:grid-cols-2">
            {visibleWidgets.map((w) => {
              const def = WIDGET_DEFS.find((d) => d.id === w.id);
              return (
                <div key={w.id} className={def?.span === 'full' ? 'sm:col-span-2' : ''}>
                  {renderWidget(w.id)}
                </div>
              );
            })}
          </div>
        </>
      )}
    </div>
  );
}
