import { useEffect, useState, useMemo } from 'react';
import { Link } from 'react-router-dom';
import { entities } from '@/lib/sheetsStore';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import { Card } from '@/components/ui/card';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Plus, Search, ChevronDown, ChevronRight, Pencil, Layers } from 'lucide-react';
import { monthLabel } from '@/lib/finance';
import LoadError from '@/components/LoadError';
import PageSkeleton from '@/components/PageSkeleton';

const PAYMENT_METHODS = [
  { value: 'cash', label: 'Cash' },
  { value: 'card', label: 'Card' },
  { value: 'bank_transfer', label: 'Bank transfer' },
  { value: 'other', label: 'Other' },
];

const fmt = (n, c = 'EUR') => `${(n || 0).toFixed(2)} ${c}`;

export default function ExpenseList() {
  const [expenses, setExpenses] = useState([]);
  const [categories, setCategories] = useState([]);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState(null);
  const [expanded, setExpanded] = useState({});
  const [filters, setFilters] = useState({
    search: '',
    category_id: 'all',
    payment_method: 'all',
    from: '',
    to: '',
  });

  const load = () => {
    setLoading(true);
    setLoadError(null);
    (async () => {
      try {
        const [exp, cats] = await Promise.all([
          entities.Expense.list('-paid_date', 500),
          entities.Category.list(),
        ]);
        setExpenses(exp);
        setCategories(cats);
      } catch (err) {
        setLoadError(err);
      } finally {
        setLoading(false);
      }
    })();
  };

  useEffect(load, []);

  const catMap = useMemo(() => {
    const m = {};
    categories.forEach((c) => { m[c.id] = c; });
    return m;
  }, [categories]);

  const filtered = useMemo(() => {
    return expenses.filter((e) => {
      if (filters.search && !(e.description || '').toLowerCase().includes(filters.search.toLowerCase())) return false;
      if (filters.category_id !== 'all' && e.category_id !== filters.category_id) return false;
      if (filters.payment_method !== 'all' && e.payment_method !== filters.payment_method) return false;
      if (filters.from && e.paid_date < filters.from) return false;
      if (filters.to && e.paid_date > filters.to) return false;
      return true;
    });
  }, [expenses, filters]);

  const set = (k, v) => setFilters((f) => ({ ...f, [k]: v }));

  if (loading) return <PageSkeleton />;
  if (loadError) return <LoadError error={loadError} onRetry={load} />;

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-heading font-semibold tracking-tight">Expenses</h1>
        <Link to="/expenses/new">
          <Button><Plus className="w-4 h-4 mr-1" /> Add</Button>
        </Link>
      </div>

      <Card className="p-4 space-y-3">
        <div className="relative">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
          <Input
            value={filters.search}
            onChange={(e) => set('search', e.target.value)}
            placeholder="Search description"
            className="pl-9"
          />
        </div>
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
          <Select value={filters.category_id} onValueChange={(v) => set('category_id', v)}>
            <SelectTrigger><SelectValue placeholder="Category" /></SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All categories</SelectItem>
              {categories.map((c) => (
                <SelectItem key={c.id} value={c.id}>{c.name}</SelectItem>
              ))}
            </SelectContent>
          </Select>
          <Select value={filters.payment_method} onValueChange={(v) => set('payment_method', v)}>
            <SelectTrigger><SelectValue placeholder="Method" /></SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All methods</SelectItem>
              {PAYMENT_METHODS.map((m) => (
                <SelectItem key={m.value} value={m.value}>{m.label}</SelectItem>
              ))}
            </SelectContent>
          </Select>
          <Input type="date" value={filters.from} onChange={(e) => set('from', e.target.value)} />
          <Input type="date" value={filters.to} onChange={(e) => set('to', e.target.value)} />
        </div>
      </Card>

      <div className="space-y-2">
        {filtered.length === 0 && (
          <p className="text-sm text-muted-foreground py-8 text-center">No expenses match your filters.</p>
        )}
        {filtered.map((e) => {
          const isOpen = expanded[e.id];
          const cat = e.category_id ? catMap[e.category_id] : null;
          return (
            <Card key={e.id} className="p-0 overflow-hidden">
              <div className="flex items-center gap-3 p-4">
                <button
                  onClick={() => setExpanded((s) => ({ ...s, [e.id]: !s[e.id] }))}
                  className="text-muted-foreground"
                >
                  {e.expense_type === 'amortized' ? (
                    isOpen ? <ChevronDown className="w-4 h-4" /> : <ChevronRight className="w-4 h-4" />
                  ) : (
                    <span className="w-4" />
                  )}
                </button>
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2 flex-wrap">
                    <p className="font-medium truncate">{e.description}</p>
                    {e.expense_type === 'amortized' && (
                      <Badge variant="secondary" className="gap-1">
                        <Layers className="w-3 h-3" /> Amortized
                      </Badge>
                    )}
                    {cat && (
                      <span
                        className="inline-flex items-center text-xs px-2 py-0.5 rounded-full"
                        style={{ background: (cat.color || '#94a3b8') + '22', color: cat.color || '#475569' }}
                      >
                        {cat.name}
                      </span>
                    )}
                  </div>
                  <p className="text-xs text-muted-foreground mt-0.5">
                    {e.paid_date} · {PAYMENT_METHODS.find((m) => m.value === e.payment_method)?.label || e.payment_method}
                    {(e.tags || []).length > 0 && ` · ${e.tags.join(', ')}`}
                  </p>
                </div>
                <div className="text-right">
                  <p className="font-semibold tabular-nums">{fmt(e.amount, e.currency)}</p>
                </div>
                <Link to={`/expenses/${e.id}/edit`}>
                  <Button variant="ghost" size="icon"><Pencil className="w-4 h-4" /></Button>
                </Link>
              </div>
              {e.expense_type === 'amortized' && isOpen && (e.amortization_schedule || []).length > 0 && (
                <div className="border-t bg-muted/30 p-4">
                  <p className="text-xs uppercase tracking-wide text-muted-foreground mb-2">
                    {e.period_value} {e.period_unit}(s) · schedule
                  </p>
                  <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
                    {e.amortization_schedule.map((s) => (
                      <div key={s.month} className="flex justify-between text-sm rounded bg-background border px-3 py-2">
                        <span className="text-muted-foreground">{monthLabel(s.month)}</span>
                        <span className="font-medium tabular-nums">{s.amount.toFixed(2)}</span>
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </Card>
          );
        })}
      </div>
    </div>
  );
}