import { useEffect, useState } from 'react';
import { useNavigate, Link } from 'react-router-dom';
import { startOfWeek, endOfWeek } from 'date-fns';
import { DragDropContext, Droppable, Draggable } from '@hello-pangea/dnd';
import { entities } from '@/lib/sheetsStore';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { Switch } from '@/components/ui/switch';
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from '@/components/ui/dropdown-menu';
import { useToast } from '@/components/ui/use-toast';
import { Plus, ChevronDown, ChevronRight, ArrowUp, ArrowDown, LayoutGrid, GripVertical, Tag } from 'lucide-react';
import {
  BarChart, Bar, XAxis, YAxis, Tooltip, Legend, ResponsiveContainer,
  PieChart, Pie, Cell,
} from 'recharts';
import {
  getMonthlyContribution, getRecentMonths, currentMonthStr, monthLabel, monthNameLong, isInMonth,
} from '@/lib/finance';
import { getIncomeSources, INCOME_SOURCE_ICONS } from '@/components/IncomeForm';
import { CategoryIcon, IconAvatar } from '@/lib/categoryIcons';
import { amountIncludingChildren } from '@/lib/categoryTree';
import LoadError from '@/components/LoadError';
import PageSkeleton from '@/components/PageSkeleton';
import { useLanguage } from '@/lib/i18n';

const INCOME_COLOR = '#10b981';

const PALETTE = ['#0f172a', '#0ea5e9', '#10b981', '#f59e0b', '#ef4444', '#8b5cf6', '#ec4899', '#14b8a6'];
const fmt = (n, c = 'EUR') => `${(n || 0).toFixed(2)} ${c}`;

function parseLocalDateDash(dateStr) {
  const [y, m, d] = dateStr.split('-').map(Number);
  return new Date(y, m - 1, d);
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
  const [categories, setCategories] = useState([]);
  const [settings, setSettings] = useState(null);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState(null);
  const [layout, setLayout] = useState(DEFAULT_LAYOUT);
  const [customizing, setCustomizing] = useState(false);

  const load = () => {
    setLoading(true);
    setLoadError(null);
    (async () => {
      try {
        const [exp, inc, cats, sets] = await Promise.all([
          entities.Expense.list('-paid_date', 500),
          entities.Income.list('-received_date', 500),
          entities.Category.list(),
          entities.Settings.list(),
        ]);
        setExpenses(exp);
        setIncomes(inc);
        setCategories(cats);
        setSettings(sets[0] || null);
      } catch (err) {
        setLoadError(err);
      } finally {
        setLoading(false);
      }
    })();
  };

  useEffect(load, []);

  useEffect(() => {
    if (settings) setLayout(normalizeLayout(settings.dashboard_layout));
  }, [settings]);

  const persistLayout = async (next) => {
    setLayout(next);
    if (!settings) return;
    try {
      const updated = await entities.Settings.update(settings.id, { dashboard_layout: next });
      setSettings(updated);
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
  // are excluded and called out instead of blended in wrong.
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
  expenses.forEach((e) => {
    if ((e.currency || 'EUR') !== currency) return;
    const contrib = getMonthlyContribution(e, thisMonth);
    if (contrib <= 0) return;
    const key = e.category_id || 'uncategorized';
    byCategory[key] = (byCategory[key] || 0) + contrib;
  });
  const pieData = Object.entries(byCategory)
    .map(([id, value]) => ({
      name: id === 'uncategorized' ? t('transactions.uncategorized') : (catMap[id]?.name || t('common.categoryFallback')),
      value: Math.round(value * 100) / 100,
      color: id === 'uncategorized' ? '#94a3b8' : (catMap[id]?.color || PALETTE[0]),
    }))
    .sort((a, b) => b.value - a.value);

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
        const d = parseLocalDateDash(e.paid_date);
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
  if (loadError) return <LoadError error={loadError} onRetry={load} />;

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
            <p className="text-sm font-medium mb-4">{t('dashboard.spendingByCategoryFor', { month: monthLabel(thisMonth, lang) })}</p>
            {pieData.length === 0 ? (
              <p className="text-sm text-muted-foreground">{t('dashboard.noSpendingThisMonth')}</p>
            ) : (
              <div className="grid sm:grid-cols-2 gap-4 items-center">
                <div className="h-56">
                  <ResponsiveContainer width="100%" height="100%">
                    <PieChart>
                      <Pie data={pieData} dataKey="value" nameKey="name" innerRadius={50} outerRadius={80} paddingAngle={2}>
                        {pieData.map((d, i) => <Cell key={i} fill={d.color} />)}
                      </Pie>
                      <Tooltip formatter={(v) => fmt(v, currency)} />
                    </PieChart>
                  </ResponsiveContainer>
                </div>
                <div className="space-y-2">
                  {pieData.map((d, i) => (
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

  return (
    <div className="space-y-8">
      <div className="flex items-center justify-between flex-wrap gap-3">
        <div>
          <h1 className="text-2xl font-heading font-semibold tracking-tight">{t('dashboard.title')}</h1>
          <p className="text-sm text-muted-foreground">{monthLabel(thisMonth, lang)}</p>
        </div>
        <div className="flex items-center gap-2">
          <Button variant="outline" onClick={() => setCustomizing((c) => !c)}>
            <LayoutGrid className="w-4 h-4 mr-1" /> {t('dashboard.customize')}
          </Button>
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

      {customizing && (
        <Card className="p-4">
          <div className="flex items-center justify-between mb-3">
            <div>
              <p className="text-sm font-medium">{t('dashboard.customizePanelTitle')}</p>
              <p className="text-xs text-muted-foreground">{t('dashboard.customizePanelSubtitle')}</p>
            </div>
            <Button variant="ghost" size="sm" onClick={() => setCustomizing(false)}>{t('dashboard.done')}</Button>
          </div>
          <DragDropContext onDragEnd={onDragEnd}>
            <Droppable droppableId="dashboard-widgets">
              {(provided) => (
                <div ref={provided.innerRef} {...provided.droppableProps} className="space-y-1">
                  {layout.map((w, index) => (
                    <Draggable key={w.id} draggableId={w.id} index={index}>
                      {(dragProvided) => (
                        <div
                          ref={dragProvided.innerRef}
                          {...dragProvided.draggableProps}
                          className="flex items-center gap-3 px-3 py-2 rounded-md hover:bg-muted/50"
                        >
                          <span {...dragProvided.dragHandleProps} className="text-muted-foreground cursor-grab">
                            <GripVertical className="w-4 h-4" />
                          </span>
                          <span className={`flex-1 text-sm ${w.visible ? '' : 'text-muted-foreground'}`}>{t(`dashboard.widgets.${w.id}`)}</span>
                          <Switch checked={w.visible} onCheckedChange={() => toggleWidget(w.id)} />
                        </div>
                      )}
                    </Draggable>
                  ))}
                  {provided.placeholder}
                </div>
              )}
            </Droppable>
          </DragDropContext>
        </Card>
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
    </div>
  );
}
