import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { entities } from '@/lib/sheetsStore';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from '@/components/ui/dropdown-menu';
import { Plus, ChevronDown } from 'lucide-react';
import {
  BarChart, Bar, XAxis, YAxis, Tooltip, Legend, ResponsiveContainer,
  PieChart, Pie, Cell,
} from 'recharts';
import {
  getMonthlyContribution, getRecentMonths, currentMonthStr, monthLabel, isInMonth,
} from '@/lib/finance';
import { INCOME_SOURCES } from '@/components/IncomeForm';
import LoadError from '@/components/LoadError';
import PageSkeleton from '@/components/PageSkeleton';

const PALETTE = ['#0f172a', '#0ea5e9', '#10b981', '#f59e0b', '#ef4444', '#8b5cf6', '#ec4899', '#14b8a6'];
const fmt = (n, c = 'EUR') => `${(n || 0).toFixed(2)} ${c}`;

export default function Dashboard() {
  const navigate = useNavigate();
  const [expenses, setExpenses] = useState([]);
  const [incomes, setIncomes] = useState([]);
  const [categories, setCategories] = useState([]);
  const [settings, setSettings] = useState(null);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState(null);

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

  const months = getRecentMonths(6);
  const thisMonth = currentMonthStr();
  const currency = settings?.default_currency || 'EUR';

  const trendData = months.map((m) => ({
    month: monthLabel(m),
    income: incomes.reduce((s, i) => s + (isInMonth(i.received_date, m) ? i.amount || 0 : 0), 0),
    expenses: expenses.reduce((s, e) => s + getMonthlyContribution(e, m), 0),
  }));

  const currentExpenseTotal = expenses.reduce((s, e) => s + getMonthlyContribution(e, thisMonth), 0);
  const currentIncomeTotal = incomes.reduce((s, i) => s + (isInMonth(i.received_date, thisMonth) ? i.amount || 0 : 0), 0);
  const currentNet = currentIncomeTotal - currentExpenseTotal;

  const byCategory = {};
  expenses.forEach((e) => {
    const contrib = getMonthlyContribution(e, thisMonth);
    if (contrib <= 0) return;
    const key = e.category_id || 'uncategorized';
    byCategory[key] = (byCategory[key] || 0) + contrib;
  });
  const pieData = Object.entries(byCategory)
    .map(([id, value]) => ({
      name: id === 'uncategorized' ? 'Uncategorized' : (catMap[id]?.name || 'Category'),
      value: Math.round(value * 100) / 100,
      color: id === 'uncategorized' ? '#94a3b8' : (catMap[id]?.color || PALETTE[0]),
    }))
    .sort((a, b) => b.value - a.value);

  const bySource = {};
  incomes.forEach((i) => {
    if (!isInMonth(i.received_date, thisMonth)) return;
    const key = i.source || 'other';
    bySource[key] = (bySource[key] || 0) + (i.amount || 0);
  });
  const incomePieData = Object.entries(bySource)
    .map(([source, value], idx) => ({
      name: INCOME_SOURCES.find((s) => s.value === source)?.label || source,
      value: Math.round(value * 100) / 100,
      color: PALETTE[idx % PALETTE.length],
    }))
    .sort((a, b) => b.value - a.value);

  const budget = settings?.monthly_budget_total;
  const budgetPct = budget > 0 ? Math.min(100, (currentExpenseTotal / budget) * 100) : 0;

  return (
    <div className="space-y-8">
      <div className="flex items-center justify-between flex-wrap gap-3">
        <div>
          <h1 className="text-2xl font-heading font-semibold tracking-tight">Dashboard</h1>
          <p className="text-sm text-muted-foreground">{monthLabel(thisMonth)}</p>
        </div>
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Button><Plus className="w-4 h-4 mr-1" /> Add <ChevronDown className="w-4 h-4 ml-1" /></Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end">
            <DropdownMenuItem onSelect={() => navigate('/income/new')}>Income</DropdownMenuItem>
            <DropdownMenuItem onSelect={() => navigate('/expenses/new')}>Expense</DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
      </div>

      <div className="grid gap-4 sm:grid-cols-3">
        <Card className="p-5">
          <p className="text-sm text-muted-foreground">Income this month</p>
          <p className="text-3xl font-heading font-semibold mt-1 tabular-nums text-emerald-600">
            +{fmt(currentIncomeTotal, currency)}
          </p>
        </Card>
        <Card className="p-5">
          <p className="text-sm text-muted-foreground">Spent this month</p>
          <p className="text-3xl font-heading font-semibold mt-1 tabular-nums">{fmt(currentExpenseTotal, currency)}</p>
        </Card>
        <Card className="p-5">
          <p className="text-sm text-muted-foreground">Net this month</p>
          <p className={`text-3xl font-heading font-semibold mt-1 tabular-nums ${currentNet >= 0 ? 'text-emerald-600' : 'text-destructive'}`}>
            {currentNet >= 0 ? '+' : ''}{fmt(currentNet, currency)}
          </p>
        </Card>
      </div>

      <div className="grid gap-4 sm:grid-cols-2">
        <Card className="p-5">
          <p className="text-sm text-muted-foreground">Monthly budget</p>
          <p className="text-3xl font-heading font-semibold mt-1 tabular-nums">
            {budget ? fmt(budget, currency) : '—'}
          </p>
          {budget > 0 && (
            <div className="mt-3">
              <div className="h-2 rounded-full bg-muted overflow-hidden">
                <div
                  className="h-full rounded-full transition-all"
                  style={{
                    width: `${budgetPct}%`,
                    background: budgetPct >= 100 ? '#ef4444' : '#0f172a',
                  }}
                />
              </div>
              <p className="text-xs text-muted-foreground mt-1">{budgetPct.toFixed(0)}% used</p>
            </div>
          )}
        </Card>
        <Card className="p-5">
          <p className="text-sm text-muted-foreground">Avg spent / month (6mo)</p>
          <p className="text-3xl font-heading font-semibold mt-1 tabular-nums">
            {fmt(trendData.reduce((s, d) => s + d.expenses, 0) / Math.max(1, trendData.length), currency)}
          </p>
        </Card>
      </div>

      <Card className="p-5">
        <p className="text-sm font-medium mb-4">Monthly trend — income vs expenses</p>
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
              <Bar dataKey="income" name="Income" fill="#10b981" radius={[4, 4, 0, 0]} />
              <Bar dataKey="expenses" name="Expenses" fill="#0f172a" radius={[4, 4, 0, 0]} />
            </BarChart>
          </ResponsiveContainer>
        </div>
      </Card>

      <div className="grid gap-4 lg:grid-cols-2">
        <Card className="p-5">
          <p className="text-sm font-medium mb-4">Spending by category — {monthLabel(thisMonth)}</p>
          {pieData.length === 0 ? (
            <p className="text-sm text-muted-foreground">No spending recorded this month yet.</p>
          ) : (
            <div className="grid sm:grid-cols-2 gap-4 items-center">
              <div className="h-56">
                <ResponsiveContainer width="100%" height="100%">
                  <PieChart>
                    <Pie data={pieData} dataKey="value" nameKey="name" innerRadius={50} outerRadius={80} paddingAngle={2}>
                      {pieData.map((d, i) => (
                        <Cell key={i} fill={d.color} />
                      ))}
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

        <Card className="p-5">
          <p className="text-sm font-medium mb-4">Income by source — {monthLabel(thisMonth)}</p>
          {incomePieData.length === 0 ? (
            <p className="text-sm text-muted-foreground">No income recorded this month yet.</p>
          ) : (
            <div className="grid sm:grid-cols-2 gap-4 items-center">
              <div className="h-56">
                <ResponsiveContainer width="100%" height="100%">
                  <PieChart>
                    <Pie data={incomePieData} dataKey="value" nameKey="name" innerRadius={50} outerRadius={80} paddingAngle={2}>
                      {incomePieData.map((d, i) => (
                        <Cell key={i} fill={d.color} />
                      ))}
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
      </div>
    </div>
  );
}
