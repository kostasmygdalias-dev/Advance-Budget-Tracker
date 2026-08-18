import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { entities } from '@/lib/sheetsStore';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Card } from '@/components/ui/card';
import {
  BarChart, Bar, LineChart, Line, AreaChart, Area, XAxis, YAxis, Tooltip, Legend,
  ResponsiveContainer, PieChart, Pie, Cell,
} from 'recharts';
import {
  getMonthlyContribution, currentMonthStr, monthLabel, isInMonth, getRecentMonths,
} from '@/lib/finance';
import { getIncomeSources } from '@/components/IncomeForm';
import { CategoryIcon, IconAvatar } from '@/lib/categoryIcons';
import { amountIncludingChildren, flattenCategoryTree } from '@/lib/categoryTree';
import LoadError from '@/components/LoadError';
import PageSkeleton from '@/components/PageSkeleton';
import { useLanguage } from '@/lib/i18n';

const PALETTE = ['#0f172a', '#0ea5e9', '#10b981', '#f59e0b', '#ef4444', '#8b5cf6', '#ec4899', '#14b8a6'];
const fmt = (n, c = 'EUR') => `${(n || 0).toFixed(2)} ${c}`;

// Every report on this page is bucketed by month, matching the granularity
// finance.js already operates at everywhere else (getMonthlyContribution,
// isInMonth, currentMonthStr) — day-precision range picking would be a
// different concept from what the rest of the app tracks.
function monthsInRange(fromMonth, toMonth) {
  const [fy, fm] = fromMonth.split('-').map(Number);
  const [ty, tm] = toMonth.split('-').map(Number);
  const months = [];
  let y = fy, m = fm;
  let guard = 0;
  while ((y < ty || (y === ty && m <= tm)) && guard < 60) {
    months.push(`${y}-${String(m).padStart(2, '0')}`);
    m++;
    if (m > 12) { m = 1; y++; }
    guard++;
  }
  return months;
}

// How much of this expense falls within the selected months — for an
// amortized expense that's whichever schedule entries land in range, not
// just whether its original paid_date does.
function rangeContribution(e, months) {
  if (e.expense_type === 'amortized') {
    return (e.amortization_schedule || []).reduce((s, entry) => (months.includes(entry.month) ? s + entry.amount : s), 0);
  }
  return months.includes((e.paid_date || '').slice(0, 7)) ? (e.amount || 0) : 0;
}

const PRESETS = [
  { key: 'preset3mo', months: 3 },
  { key: 'preset6mo', months: 6 },
  { key: 'preset12mo', months: 12 },
];

export default function Reports() {
  const { t, lang } = useLanguage();
  const incomeSources = getIncomeSources(t);
  const [expenses, setExpenses] = useState([]);
  const [incomes, setIncomes] = useState([]);
  const [categories, setCategories] = useState([]);
  const [settings, setSettings] = useState(null);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState(null);
  const [fromMonth, setFromMonth] = useState(getRecentMonths(6)[0]);
  const [toMonth, setToMonth] = useState(currentMonthStr());
  const [focusCategoryId, setFocusCategoryId] = useState('all');

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

  if (loading) return <PageSkeleton rows={4} />;
  if (loadError) return <LoadError error={loadError} onRetry={load} />;

  const catMap = {};
  categories.forEach((c) => { catMap[c.id] = c; });

  const currency = settings?.default_currency || 'EUR';
  const applyPreset = (n) => {
    setFromMonth(getRecentMonths(n)[0]);
    setToMonth(currentMonthStr());
  };

  const months = monthsInRange(fromMonth, toMonth);

  const otherCurrencyCount =
    expenses.filter((e) => (e.currency || 'EUR') !== currency && rangeContribution(e, months) > 0).length +
    incomes.filter((i) => (i.currency || 'EUR') !== currency && months.includes((i.received_date || '').slice(0, 7))).length;

  // One pass per month for income/expense/net/cumulative/savings-rate —
  // everything below that's "over time" reads from this single array.
  let runningNet = 0;
  const monthly = months.map((m) => {
    const income = incomes.reduce((s, i) => s + ((i.currency || 'EUR') === currency && isInMonth(i.received_date, m) ? i.amount || 0 : 0), 0);
    const expense = expenses.reduce((s, e) => s + ((e.currency || 'EUR') === currency ? getMonthlyContribution(e, m) : 0), 0);
    const net = income - expense;
    runningNet += net;
    return {
      month: monthLabel(m, lang),
      income, expense, net,
      cumulative: runningNet,
      savingsRate: income > 0 ? (net / income) * 100 : 0,
    };
  });

  const totalIncome = monthly.reduce((s, d) => s + d.income, 0);
  const totalExpense = monthly.reduce((s, d) => s + d.expense, 0);

  // Spending by category, for the whole range.
  const categoryTotals = {};
  const categoryCounts = {};
  expenses.forEach((e) => {
    if ((e.currency || 'EUR') !== currency) return;
    const contrib = rangeContribution(e, months);
    if (contrib <= 0) return;
    const key = e.category_id || 'uncategorized';
    categoryTotals[key] = (categoryTotals[key] || 0) + contrib;
    categoryCounts[key] = (categoryCounts[key] || 0) + 1;
  });
  // Grouped by top-level category, each rolling up its subcategories'
  // totals (same rollup already used for budget vs. actual below) — so
  // "how much did I spend on Transport" reads as one number even when every
  // transaction is actually tagged to Fuel/Parking/etc underneath it.
  const categoryReport = [];
  let currentGroup = null;
  flattenCategoryTree(categories).forEach((c) => {
    if (c.depth === 0) {
      const total = amountIncludingChildren(c.id, categoryTotals, categories);
      currentGroup = total > 0 ? {
        id: c.id, name: c.name, color: c.color || PALETTE[0], icon: c.icon,
        total, count: categoryCounts[c.id] || 0, children: [],
      } : null;
      if (currentGroup) categoryReport.push(currentGroup);
    } else if (currentGroup && categoryTotals[c.id] > 0) {
      currentGroup.count += categoryCounts[c.id] || 0;
      currentGroup.children.push({
        id: c.id, name: c.name, color: c.color || PALETTE[0], icon: c.icon,
        total: categoryTotals[c.id], count: categoryCounts[c.id] || 0,
      });
    }
  });
  if (categoryTotals.uncategorized > 0) {
    categoryReport.push({
      id: 'uncategorized', name: t('transactions.uncategorized'), color: '#94a3b8', icon: null,
      total: categoryTotals.uncategorized, count: categoryCounts.uncategorized || 0, children: [],
    });
  }
  categoryReport.forEach((g) => {
    g.pct = totalExpense > 0 ? (g.total / totalExpense) * 100 : 0;
    g.children.sort((a, b) => b.total - a.total).forEach((c) => {
      c.pct = totalExpense > 0 ? (c.total / totalExpense) * 100 : 0;
    });
  });
  categoryReport.sort((a, b) => b.total - a.total);

  // Drill-down for whichever single category the user focused (a top-level
  // group with its children, a child on its own, or nothing when "all").
  // Reuses categoryReport's already-rolled-up totals rather than
  // recomputing them, and adds the one thing that view can't show: a
  // month-by-month trend for just this category.
  const focusGroup = focusCategoryId !== 'all' ? categoryReport.find((g) => g.id === focusCategoryId) : null;
  const focusChild = !focusGroup && focusCategoryId !== 'all'
    ? categoryReport.flatMap((g) => g.children).find((c) => c.id === focusCategoryId)
    : null;
  const focusEntry = focusGroup || focusChild;
  const focusMonthlyIds = focusGroup
    ? new Set([focusGroup.id, ...focusGroup.children.map((c) => c.id)])
    : (focusChild ? new Set([focusChild.id]) : null);
  const focusMonthly = focusMonthlyIds ? months.map((m) => ({
    month: monthLabel(m, lang),
    total: expenses.reduce((s, e) => {
      if ((e.currency || 'EUR') !== currency) return s;
      if (!focusMonthlyIds.has(e.category_id || 'uncategorized')) return s;
      return s + getMonthlyContribution(e, m);
    }, 0),
  })) : [];

  // Income by source, for the whole range.
  const sourceTotals = {};
  const sourceCounts = {};
  incomes.forEach((i) => {
    if ((i.currency || 'EUR') !== currency || !months.includes((i.received_date || '').slice(0, 7))) return;
    const key = i.source || 'other';
    sourceTotals[key] = (sourceTotals[key] || 0) + (i.amount || 0);
    sourceCounts[key] = (sourceCounts[key] || 0) + 1;
  });
  const sourceReport = Object.entries(sourceTotals)
    .map(([source, total], idx) => ({
      source,
      name: incomeSources.find((s) => s.value === source)?.label || source,
      color: PALETTE[idx % PALETTE.length],
      total,
      count: sourceCounts[source],
      pct: totalIncome > 0 ? (total / totalIncome) * 100 : 0,
    }))
    .sort((a, b) => b.total - a.total);

  // Budget vs actual — only categories that actually have a budget set.
  const budgetPerCategory = settings?.budget_per_category || {};
  const budgetReport = Object.entries(budgetPerCategory)
    .filter(([, amt]) => amt > 0)
    .map(([catId, monthlyBudget]) => {
      const totalBudget = monthlyBudget * months.length;
      const actual = amountIncludingChildren(catId, categoryTotals, categories);
      const hasChildren = categories.some((c) => c.parent_id === catId);
      return {
        id: catId,
        name: catMap[catId]?.name || t('common.categoryFallback'),
        color: catMap[catId]?.color || PALETTE[0],
        hasChildren,
        totalBudget, actual,
        variance: actual - totalBudget,
        pct: totalBudget > 0 ? (actual / totalBudget) * 100 : 0,
      };
    })
    .sort((a, b) => b.pct - a.pct);

  // Biggest individual expenses in range.
  const biggestExpenses = expenses
    .filter((e) => (e.currency || 'EUR') === currency)
    .map((e) => ({ ...e, _contrib: rangeContribution(e, months) }))
    .filter((e) => e._contrib > 0)
    .sort((a, b) => b._contrib - a._contrib)
    .slice(0, 10);

  return (
    <div className="space-y-8">
      <div className="flex items-center justify-between flex-wrap gap-3">
        <div>
          <h1 className="text-2xl font-heading font-semibold tracking-tight">{t('reports.title')}</h1>
          <p className="text-sm text-muted-foreground">{monthLabel(fromMonth, lang)} – {monthLabel(toMonth, lang)}</p>
        </div>
      </div>

      <Card className="p-4">
        <div className="flex items-end gap-3 flex-wrap">
          <div className="space-y-1.5">
            <Label htmlFor="from-month" className="text-xs">{t('reports.from')}</Label>
            <Input id="from-month" type="month" value={fromMonth} onChange={(e) => setFromMonth(e.target.value)} className="w-40" />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="to-month" className="text-xs">{t('reports.to')}</Label>
            <Input id="to-month" type="month" value={toMonth} onChange={(e) => setToMonth(e.target.value)} className="w-40" />
          </div>
          <div className="flex gap-1.5">
            {PRESETS.map((p) => (
              <Button key={p.key} variant="outline" size="sm" onClick={() => applyPreset(p.months)}>{t(`reports.${p.key}`)}</Button>
            ))}
          </div>
        </div>
        {otherCurrencyCount > 0 && (
          <p className="text-xs text-muted-foreground mt-3">
            {otherCurrencyCount === 1
              ? t('reports.otherCurrenciesNoteOne', { currency, count: otherCurrencyCount })
              : t('reports.otherCurrenciesNoteOther', { currency, count: otherCurrencyCount })} <Link to="/transactions?month=all" className="underline">{t('reports.viewThem')}</Link>.
          </p>
        )}
      </Card>

      <div className="grid gap-4 sm:grid-cols-3">
        <Card className="p-5">
          <p className="text-sm text-muted-foreground">{t('reports.totalIncome')}</p>
          <p className="text-2xl font-heading font-semibold mt-1 tabular-nums text-emerald-600">+{fmt(totalIncome, currency)}</p>
        </Card>
        <Card className="p-5">
          <p className="text-sm text-muted-foreground">{t('reports.totalSpent')}</p>
          <p className="text-2xl font-heading font-semibold mt-1 tabular-nums">{fmt(totalExpense, currency)}</p>
        </Card>
        <Card className="p-5">
          <p className="text-sm text-muted-foreground">{t('reports.net')}</p>
          <p className={`text-2xl font-heading font-semibold mt-1 tabular-nums ${totalIncome - totalExpense >= 0 ? 'text-emerald-600' : 'text-destructive'}`}>
            {totalIncome - totalExpense >= 0 ? '+' : ''}{fmt(totalIncome - totalExpense, currency)}
          </p>
        </Card>
      </div>

      <Card className="p-5">
        <p className="text-sm font-medium mb-4">{t('reports.incomeVsExpenses')}</p>
        <div className="h-64">
          <ResponsiveContainer width="100%" height="100%">
            <BarChart data={monthly} margin={{ top: 4, right: 8, bottom: 4, left: 8 }}>
              <XAxis dataKey="month" tick={{ fontSize: 12 }} tickLine={false} axisLine={false} />
              <YAxis tick={{ fontSize: 12 }} tickLine={false} axisLine={false} width={48} />
              <Tooltip formatter={(v) => fmt(v, currency)} cursor={{ fill: 'hsl(var(--muted))' }} contentStyle={{ borderRadius: 8, border: '1px solid hsl(var(--border))' }} />
              <Legend wrapperStyle={{ fontSize: 12 }} />
              <Bar dataKey="income" name={t('common.income')} fill="#10b981" radius={[4, 4, 0, 0]} />
              <Bar dataKey="expense" name={t('common.expense')} fill="#0f172a" radius={[4, 4, 0, 0]} />
            </BarChart>
          </ResponsiveContainer>
        </div>
      </Card>

      <div className="grid gap-4 lg:grid-cols-2">
        <Card className="p-5">
          <p className="text-sm font-medium mb-1">{t('reports.savingsRate')}</p>
          <p className="text-xs text-muted-foreground mb-4">{t('reports.savingsRateFormula')}</p>
          <div className="h-48">
            <ResponsiveContainer width="100%" height="100%">
              <LineChart data={monthly} margin={{ top: 4, right: 8, bottom: 4, left: 8 }}>
                <XAxis dataKey="month" tick={{ fontSize: 12 }} tickLine={false} axisLine={false} />
                <YAxis tick={{ fontSize: 12 }} tickLine={false} axisLine={false} width={40} tickFormatter={(v) => `${v}%`} />
                <Tooltip formatter={(v) => `${v.toFixed(1)}%`} contentStyle={{ borderRadius: 8, border: '1px solid hsl(var(--border))' }} />
                <Line type="monotone" dataKey="savingsRate" name={t('reports.savingsRate')} stroke="#8b5cf6" strokeWidth={2} dot={{ r: 3 }} />
              </LineChart>
            </ResponsiveContainer>
          </div>
        </Card>

        <Card className="p-5">
          <p className="text-sm font-medium mb-1">{t('reports.cumulativeNet')}</p>
          <p className="text-xs text-muted-foreground mb-4">{t('reports.cumulativeNetSubtitle')}</p>
          <div className="h-48">
            <ResponsiveContainer width="100%" height="100%">
              <AreaChart data={monthly} margin={{ top: 4, right: 8, bottom: 4, left: 8 }}>
                <defs>
                  <linearGradient id="cumFill" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="0%" stopColor="#0ea5e9" stopOpacity={0.3} />
                    <stop offset="100%" stopColor="#0ea5e9" stopOpacity={0} />
                  </linearGradient>
                </defs>
                <XAxis dataKey="month" tick={{ fontSize: 12 }} tickLine={false} axisLine={false} />
                <YAxis tick={{ fontSize: 12 }} tickLine={false} axisLine={false} width={48} />
                <Tooltip formatter={(v) => fmt(v, currency)} contentStyle={{ borderRadius: 8, border: '1px solid hsl(var(--border))' }} />
                <Area type="monotone" dataKey="cumulative" name={t('reports.cumulativeNet')} stroke="#0ea5e9" strokeWidth={2} fill="url(#cumFill)" />
              </AreaChart>
            </ResponsiveContainer>
          </div>
        </Card>
      </div>

      <div className="grid gap-4 lg:grid-cols-2">
        <Card className="p-5">
          <div className="flex items-center justify-between gap-3 mb-4 flex-wrap">
            <p className="text-sm font-medium">{t('reports.spendingByCategory')}</p>
            {categoryReport.length > 0 && (
              <Select value={focusCategoryId} onValueChange={setFocusCategoryId}>
                <SelectTrigger className="w-48 h-8 text-xs"><SelectValue placeholder={t('reports.focusCategory')} /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">{t('reports.allCategories')}</SelectItem>
                  {categoryReport.flatMap((g) => [
                    <SelectItem key={g.id} value={g.id}>{g.name}</SelectItem>,
                    ...g.children.map((c) => (
                      <SelectItem key={c.id} value={c.id} className="pl-6 text-muted-foreground">↳ {c.name}</SelectItem>
                    )),
                  ])}
                </SelectContent>
              </Select>
            )}
          </div>
          {categoryReport.length === 0 ? (
            <p className="text-sm text-muted-foreground">{t('reports.noSpendingInRange')}</p>
          ) : focusEntry ? (
            <div className="space-y-4">
              <div className="flex items-center gap-3">
                <IconAvatar icon={(props) => <CategoryIcon name={focusEntry.icon} {...props} />} color={focusEntry.color} className="w-10 h-10" />
                <div>
                  <p className="text-sm font-medium">{focusEntry.name}</p>
                  <p className="text-2xl font-heading font-semibold tabular-nums">{fmt(focusEntry.total, currency)}</p>
                </div>
              </div>
              <div className="h-40">
                <ResponsiveContainer width="100%" height="100%">
                  <BarChart data={focusMonthly} margin={{ top: 4, right: 8, bottom: 4, left: 8 }}>
                    <XAxis dataKey="month" tick={{ fontSize: 11 }} tickLine={false} axisLine={false} />
                    <YAxis tick={{ fontSize: 11 }} tickLine={false} axisLine={false} width={40} />
                    <Tooltip formatter={(v) => fmt(v, currency)} cursor={{ fill: 'hsl(var(--muted))' }} contentStyle={{ borderRadius: 8, border: '1px solid hsl(var(--border))' }} />
                    <Bar dataKey="total" name={t('reports.spendingTrend')} fill={focusEntry.color} radius={[4, 4, 0, 0]} />
                  </BarChart>
                </ResponsiveContainer>
              </div>
              {focusGroup && (
                focusGroup.children.length === 0 ? (
                  <p className="text-sm text-muted-foreground">{t('reports.noSubcategorySpending')}</p>
                ) : (
                  <div className="space-y-2">
                    {focusGroup.children.map((c) => (
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
            <>
              <div className="h-48 mb-4">
                <ResponsiveContainer width="100%" height="100%">
                  <PieChart>
                    <Pie data={categoryReport} dataKey="total" nameKey="name" innerRadius={45} outerRadius={72} paddingAngle={2}>
                      {categoryReport.map((d, i) => <Cell key={i} fill={d.color} />)}
                    </Pie>
                    <Tooltip formatter={(v) => fmt(v, currency)} />
                  </PieChart>
                </ResponsiveContainer>
              </div>
              <div className="space-y-1">
                {categoryReport.map((d) => (
                  <div key={d.id} className="space-y-1">
                    <div className="flex items-center gap-3 text-sm">
                      <IconAvatar icon={(props) => <CategoryIcon name={d.icon} {...props} />} color={d.color} className="w-7 h-7" />
                      <span className="flex-1 min-w-0 truncate font-medium">{d.name}</span>
                      <span className="text-xs text-muted-foreground">{d.count}×</span>
                      <span className="text-xs text-muted-foreground w-10 text-right">{d.pct.toFixed(0)}%</span>
                      <span className="tabular-nums font-medium w-20 text-right">{fmt(d.total, currency)}</span>
                    </div>
                    {d.children.map((c) => (
                      <div key={c.id} className="flex items-center gap-3 text-sm ml-7 pl-3 border-l">
                        <IconAvatar icon={(props) => <CategoryIcon name={c.icon} {...props} />} color={c.color} className="w-6 h-6" />
                        <span className="flex-1 min-w-0 truncate text-muted-foreground">{c.name}</span>
                        <span className="text-xs text-muted-foreground">{c.count}×</span>
                        <span className="text-xs text-muted-foreground w-10 text-right">{c.pct.toFixed(0)}%</span>
                        <span className="tabular-nums w-20 text-right">{fmt(c.total, currency)}</span>
                      </div>
                    ))}
                  </div>
                ))}
              </div>
            </>
          )}
        </Card>

        <Card className="p-5">
          <p className="text-sm font-medium mb-4">{t('reports.incomeBySource')}</p>
          {sourceReport.length === 0 ? (
            <p className="text-sm text-muted-foreground">{t('reports.noIncomeInRange')}</p>
          ) : (
            <>
              <div className="h-48 mb-4">
                <ResponsiveContainer width="100%" height="100%">
                  <PieChart>
                    <Pie data={sourceReport} dataKey="total" nameKey="name" innerRadius={45} outerRadius={72} paddingAngle={2}>
                      {sourceReport.map((d, i) => <Cell key={i} fill={d.color} />)}
                    </Pie>
                    <Tooltip formatter={(v) => fmt(v, currency)} />
                  </PieChart>
                </ResponsiveContainer>
              </div>
              <div className="space-y-2">
                {sourceReport.map((d) => (
                  <div key={d.source} className="flex items-center gap-3 text-sm">
                    <span className="w-3 h-3 rounded-full shrink-0" style={{ background: d.color }} />
                    <span className="flex-1 min-w-0 truncate">{d.name}</span>
                    <span className="text-xs text-muted-foreground">{d.count}×</span>
                    <span className="text-xs text-muted-foreground w-10 text-right">{d.pct.toFixed(0)}%</span>
                    <span className="tabular-nums font-medium w-20 text-right text-emerald-600">+{fmt(d.total, currency)}</span>
                  </div>
                ))}
              </div>
            </>
          )}
        </Card>
      </div>

      <Card className="p-5">
        <p className="text-sm font-medium mb-1">{t('reports.budgetVsActual')}</p>
        <p className="text-xs text-muted-foreground mb-4">{t('reports.budgetVsActualSubtitle')}</p>
        {budgetReport.length === 0 ? (
          <p className="text-sm text-muted-foreground">{t('reports.noBudgetsYet')}</p>
        ) : (
          <div className="space-y-3">
            {budgetReport.map((d) => (
              <div key={d.id}>
                <div className="flex items-center justify-between text-sm mb-1">
                  <span className="flex items-center gap-2">
                    <span className="w-2.5 h-2.5 rounded-full" style={{ background: d.color }} />
                    {d.name}
                    {d.hasChildren && <span className="text-xs text-muted-foreground">({t('budgets.includesSubcategories')})</span>}
                  </span>
                  <span className="tabular-nums text-muted-foreground">
                    {fmt(d.actual, currency)} / {fmt(d.totalBudget, currency)}
                  </span>
                </div>
                <div className="h-2 rounded-full bg-muted overflow-hidden">
                  <div
                    className="h-full rounded-full transition-all"
                    style={{ width: `${Math.min(100, d.pct)}%`, background: d.pct >= 100 ? '#ef4444' : d.color }}
                  />
                </div>
              </div>
            ))}
          </div>
        )}
      </Card>

      <Card className="p-5">
        <p className="text-sm font-medium mb-4">{t('reports.biggestExpenses')}</p>
        {biggestExpenses.length === 0 ? (
          <p className="text-sm text-muted-foreground">{t('reports.noExpensesInRange')}</p>
        ) : (
          <div className="space-y-2">
            {biggestExpenses.map((e) => {
              const cat = e.category_id ? catMap[e.category_id] : null;
              const color = cat?.color || '#94a3b8';
              return (
                <div key={e.id} className="flex items-center gap-3">
                  <IconAvatar icon={(props) => <CategoryIcon name={cat?.icon} {...props} />} color={color} className="w-8 h-8" />
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-medium truncate">{e.description}</p>
                    <p className="text-xs text-muted-foreground">{cat ? `${cat.name} · ` : ''}{e.paid_date}</p>
                  </div>
                  <span className="text-sm font-semibold tabular-nums">{fmt(e._contrib, e.currency)}</span>
                </div>
              );
            })}
          </div>
        )}
      </Card>
    </div>
  );
}
