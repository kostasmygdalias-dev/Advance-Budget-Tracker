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
import { INCOME_SOURCES } from '@/components/IncomeForm';
import { CategoryIcon, IconAvatar } from '@/lib/categoryIcons';
import LoadError from '@/components/LoadError';
import PageSkeleton from '@/components/PageSkeleton';

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
  { label: '3mo', months: 3 },
  { label: '6mo', months: 6 },
  { label: '12mo', months: 12 },
];

export default function Reports() {
  const [expenses, setExpenses] = useState([]);
  const [incomes, setIncomes] = useState([]);
  const [categories, setCategories] = useState([]);
  const [settings, setSettings] = useState(null);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState(null);
  const [fromMonth, setFromMonth] = useState(getRecentMonths(6)[0]);
  const [toMonth, setToMonth] = useState(currentMonthStr());

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
      month: monthLabel(m),
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
  const categoryReport = Object.entries(categoryTotals)
    .map(([id, total]) => ({
      id,
      name: id === 'uncategorized' ? 'Uncategorized' : (catMap[id]?.name || 'Category'),
      color: id === 'uncategorized' ? '#94a3b8' : (catMap[id]?.color || PALETTE[0]),
      total,
      count: categoryCounts[id],
      avg: total / categoryCounts[id],
      pct: totalExpense > 0 ? (total / totalExpense) * 100 : 0,
    }))
    .sort((a, b) => b.total - a.total);

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
      name: INCOME_SOURCES.find((s) => s.value === source)?.label || source,
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
      const actual = categoryTotals[catId] || 0;
      return {
        id: catId,
        name: catMap[catId]?.name || 'Category',
        color: catMap[catId]?.color || PALETTE[0],
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
          <h1 className="text-2xl font-heading font-semibold tracking-tight">Reports</h1>
          <p className="text-sm text-muted-foreground">{monthLabel(fromMonth)} – {monthLabel(toMonth)}</p>
        </div>
      </div>

      <Card className="p-4">
        <div className="flex items-end gap-3 flex-wrap">
          <div className="space-y-1.5">
            <Label htmlFor="from-month" className="text-xs">From</Label>
            <Input id="from-month" type="month" value={fromMonth} onChange={(e) => setFromMonth(e.target.value)} className="w-40" />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="to-month" className="text-xs">To</Label>
            <Input id="to-month" type="month" value={toMonth} onChange={(e) => setToMonth(e.target.value)} className="w-40" />
          </div>
          <div className="flex gap-1.5">
            {PRESETS.map((p) => (
              <Button key={p.label} variant="outline" size="sm" onClick={() => applyPreset(p.months)}>{p.label}</Button>
            ))}
          </div>
        </div>
        {otherCurrencyCount > 0 && (
          <p className="text-xs text-muted-foreground mt-3">
            Showing {currency} only — {otherCurrencyCount} transaction{otherCurrencyCount === 1 ? '' : 's'} in other currencies {otherCurrencyCount === 1 ? "isn't" : "aren't"} included. <Link to="/transactions?month=all" className="underline">View them</Link>.
          </p>
        )}
      </Card>

      <div className="grid gap-4 sm:grid-cols-3">
        <Card className="p-5">
          <p className="text-sm text-muted-foreground">Total income</p>
          <p className="text-2xl font-heading font-semibold mt-1 tabular-nums text-emerald-600">+{fmt(totalIncome, currency)}</p>
        </Card>
        <Card className="p-5">
          <p className="text-sm text-muted-foreground">Total spent</p>
          <p className="text-2xl font-heading font-semibold mt-1 tabular-nums">{fmt(totalExpense, currency)}</p>
        </Card>
        <Card className="p-5">
          <p className="text-sm text-muted-foreground">Net</p>
          <p className={`text-2xl font-heading font-semibold mt-1 tabular-nums ${totalIncome - totalExpense >= 0 ? 'text-emerald-600' : 'text-destructive'}`}>
            {totalIncome - totalExpense >= 0 ? '+' : ''}{fmt(totalIncome - totalExpense, currency)}
          </p>
        </Card>
      </div>

      <Card className="p-5">
        <p className="text-sm font-medium mb-4">Income vs expenses</p>
        <div className="h-64">
          <ResponsiveContainer width="100%" height="100%">
            <BarChart data={monthly} margin={{ top: 4, right: 8, bottom: 4, left: 8 }}>
              <XAxis dataKey="month" tick={{ fontSize: 12 }} tickLine={false} axisLine={false} />
              <YAxis tick={{ fontSize: 12 }} tickLine={false} axisLine={false} width={48} />
              <Tooltip formatter={(v) => fmt(v, currency)} cursor={{ fill: 'hsl(var(--muted))' }} contentStyle={{ borderRadius: 8, border: '1px solid hsl(var(--border))' }} />
              <Legend wrapperStyle={{ fontSize: 12 }} />
              <Bar dataKey="income" name="Income" fill="#10b981" radius={[4, 4, 0, 0]} />
              <Bar dataKey="expense" name="Expenses" fill="#0f172a" radius={[4, 4, 0, 0]} />
            </BarChart>
          </ResponsiveContainer>
        </div>
      </Card>

      <div className="grid gap-4 lg:grid-cols-2">
        <Card className="p-5">
          <p className="text-sm font-medium mb-1">Savings rate</p>
          <p className="text-xs text-muted-foreground mb-4">(income − expenses) ÷ income, per month</p>
          <div className="h-48">
            <ResponsiveContainer width="100%" height="100%">
              <LineChart data={monthly} margin={{ top: 4, right: 8, bottom: 4, left: 8 }}>
                <XAxis dataKey="month" tick={{ fontSize: 12 }} tickLine={false} axisLine={false} />
                <YAxis tick={{ fontSize: 12 }} tickLine={false} axisLine={false} width={40} tickFormatter={(v) => `${v}%`} />
                <Tooltip formatter={(v) => `${v.toFixed(1)}%`} contentStyle={{ borderRadius: 8, border: '1px solid hsl(var(--border))' }} />
                <Line type="monotone" dataKey="savingsRate" name="Savings rate" stroke="#8b5cf6" strokeWidth={2} dot={{ r: 3 }} />
              </LineChart>
            </ResponsiveContainer>
          </div>
        </Card>

        <Card className="p-5">
          <p className="text-sm font-medium mb-1">Cumulative net</p>
          <p className="text-xs text-muted-foreground mb-4">Running total of income minus expenses across the range</p>
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
                <Area type="monotone" dataKey="cumulative" name="Cumulative net" stroke="#0ea5e9" strokeWidth={2} fill="url(#cumFill)" />
              </AreaChart>
            </ResponsiveContainer>
          </div>
        </Card>
      </div>

      <div className="grid gap-4 lg:grid-cols-2">
        <Card className="p-5">
          <p className="text-sm font-medium mb-4">Spending by category</p>
          {categoryReport.length === 0 ? (
            <p className="text-sm text-muted-foreground">No spending in this range.</p>
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
              <div className="space-y-2">
                {categoryReport.map((d) => (
                  <div key={d.id} className="flex items-center gap-3 text-sm">
                    <IconAvatar icon={(props) => <CategoryIcon name={catMap[d.id]?.icon} {...props} />} color={d.color} className="w-7 h-7" />
                    <span className="flex-1 min-w-0 truncate">{d.name}</span>
                    <span className="text-xs text-muted-foreground">{d.count}×</span>
                    <span className="text-xs text-muted-foreground w-10 text-right">{d.pct.toFixed(0)}%</span>
                    <span className="tabular-nums font-medium w-20 text-right">{fmt(d.total, currency)}</span>
                  </div>
                ))}
              </div>
            </>
          )}
        </Card>

        <Card className="p-5">
          <p className="text-sm font-medium mb-4">Income by source</p>
          {sourceReport.length === 0 ? (
            <p className="text-sm text-muted-foreground">No income in this range.</p>
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
        <p className="text-sm font-medium mb-1">Budget vs actual</p>
        <p className="text-xs text-muted-foreground mb-4">Categories with a per-category budget set in Settings, totaled across the range</p>
        {budgetReport.length === 0 ? (
          <p className="text-sm text-muted-foreground">No per-category budgets set yet — add some in Settings.</p>
        ) : (
          <div className="space-y-3">
            {budgetReport.map((d) => (
              <div key={d.id}>
                <div className="flex items-center justify-between text-sm mb-1">
                  <span className="flex items-center gap-2">
                    <span className="w-2.5 h-2.5 rounded-full" style={{ background: d.color }} />
                    {d.name}
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
        <p className="text-sm font-medium mb-4">Biggest expenses</p>
        {biggestExpenses.length === 0 ? (
          <p className="text-sm text-muted-foreground">No expenses in this range.</p>
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
