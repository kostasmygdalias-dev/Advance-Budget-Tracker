import { useEffect, useState, useMemo } from 'react';
import { Link, useNavigate, useSearchParams } from 'react-router-dom';
import { entities } from '@/lib/sheetsStore';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import { Card } from '@/components/ui/card';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Tabs, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from '@/components/ui/dropdown-menu';
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent,
  AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle,
} from '@/components/ui/alert-dialog';
import { buttonVariants } from '@/components/ui/button';
import { useToast } from '@/components/ui/use-toast';
import { Plus, Search, ChevronDown, ChevronRight, Pencil, Trash2, Layers } from 'lucide-react';
import { monthLabel } from '@/lib/finance';
import { INCOME_SOURCES } from '@/components/IncomeForm';
import LoadError from '@/components/LoadError';
import PageSkeleton from '@/components/PageSkeleton';

const PAYMENT_METHODS = [
  { value: 'cash', label: 'Cash' },
  { value: 'card', label: 'Card' },
  { value: 'bank_transfer', label: 'Bank transfer' },
  { value: 'other', label: 'Other' },
];

const fmt = (n, c = 'EUR') => `${(n || 0).toFixed(2)} ${c}`;

function ExpenseRow({ e, cat, isOpen, onToggle, onDelete }) {
  return (
    <Card className="p-0 overflow-hidden">
      <div className="flex items-center gap-3 p-4">
        <button onClick={onToggle} className="text-muted-foreground">
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
        <Button variant="ghost" size="icon" onClick={onDelete}><Trash2 className="w-4 h-4" /></Button>
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
}

function IncomeRow({ i, onDelete }) {
  return (
    <Card className="p-0 overflow-hidden">
      <div className="flex items-center gap-3 p-4">
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 flex-wrap">
            <p className="font-medium truncate">{i.description}</p>
            <span className="inline-flex items-center text-xs px-2 py-0.5 rounded-full bg-emerald-100 text-emerald-700">
              {INCOME_SOURCES.find((s) => s.value === i.source)?.label || i.source}
            </span>
          </div>
          <p className="text-xs text-muted-foreground mt-0.5">
            {i.received_date}
            {(i.tags || []).length > 0 && ` · ${i.tags.join(', ')}`}
          </p>
        </div>
        <div className="text-right">
          <p className="font-semibold tabular-nums text-emerald-600">+{fmt(i.amount, i.currency)}</p>
        </div>
        <Link to={`/income/${i.id}/edit`}>
          <Button variant="ghost" size="icon"><Pencil className="w-4 h-4" /></Button>
        </Link>
        <Button variant="ghost" size="icon" onClick={onDelete}><Trash2 className="w-4 h-4" /></Button>
      </div>
    </Card>
  );
}

export default function Transactions() {
  const navigate = useNavigate();
  const { toast } = useToast();
  const [searchParams, setSearchParams] = useSearchParams();
  const initialType = ['income', 'expense'].includes(searchParams.get('type')) ? searchParams.get('type') : 'all';

  const [expenses, setExpenses] = useState([]);
  const [incomes, setIncomes] = useState([]);
  const [categories, setCategories] = useState([]);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState(null);
  const [expanded, setExpanded] = useState({});
  const [type, setType] = useState(initialType);
  const [deleteTarget, setDeleteTarget] = useState(null);
  const [filters, setFilters] = useState({
    search: '', category_id: 'all', payment_method: 'all', source: 'all', from: '', to: '',
  });

  const load = () => {
    setLoading(true);
    setLoadError(null);
    (async () => {
      try {
        const [exp, inc, cats] = await Promise.all([
          entities.Expense.list('-paid_date', 500),
          entities.Income.list('-received_date', 500),
          entities.Category.list(),
        ]);
        setExpenses(exp);
        setIncomes(inc);
        setCategories(cats);
      } catch (err) {
        setLoadError(err);
      } finally {
        setLoading(false);
      }
    })();
  };

  useEffect(load, []);

  const changeType = (next) => {
    setType(next);
    setSearchParams(next === 'all' ? {} : { type: next }, { replace: true });
  };

  const catMap = useMemo(() => {
    const m = {};
    categories.forEach((c) => { m[c.id] = c; });
    return m;
  }, [categories]);

  const combined = useMemo(() => {
    const exp = expenses.map((e) => ({ ...e, _type: 'expense', _date: e.paid_date }));
    const inc = incomes.map((i) => ({ ...i, _type: 'income', _date: i.received_date }));
    return [...exp, ...inc].sort((a, b) => (b._date || '').localeCompare(a._date || ''));
  }, [expenses, incomes]);

  const filtered = useMemo(() => {
    return combined.filter((row) => {
      if (type !== 'all' && row._type !== type) return false;
      if (filters.search && !(row.description || '').toLowerCase().includes(filters.search.toLowerCase())) return false;
      if (row._type === 'expense') {
        if (filters.category_id !== 'all' && row.category_id !== filters.category_id) return false;
        if (filters.payment_method !== 'all' && row.payment_method !== filters.payment_method) return false;
      } else if (filters.source !== 'all' && row.source !== filters.source) return false;
      if (filters.from && row._date < filters.from) return false;
      if (filters.to && row._date > filters.to) return false;
      return true;
    });
  }, [combined, type, filters]);

  const set = (k, v) => setFilters((f) => ({ ...f, [k]: v }));

  const confirmDelete = async () => {
    const target = deleteTarget;
    setDeleteTarget(null);
    try {
      if (target._type === 'expense') {
        await entities.Expense.delete(target.id);
      } else {
        await entities.Income.delete(target.id);
      }
      load();
    } catch (err) {
      toast({ title: 'Could not delete', description: err.message, variant: 'destructive' });
    }
  };

  if (loading) return <PageSkeleton />;
  if (loadError) return <LoadError error={loadError} onRetry={load} />;

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between flex-wrap gap-3">
        <h1 className="text-2xl font-heading font-semibold tracking-tight">Transactions</h1>
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

      <Tabs value={type} onValueChange={changeType}>
        <TabsList>
          <TabsTrigger value="all">All</TabsTrigger>
          <TabsTrigger value="income">Income</TabsTrigger>
          <TabsTrigger value="expense">Expenses</TabsTrigger>
        </TabsList>
      </Tabs>

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
          {type === 'expense' && (
            <Select value={filters.category_id} onValueChange={(v) => set('category_id', v)}>
              <SelectTrigger><SelectValue placeholder="Category" /></SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All categories</SelectItem>
                {categories.map((c) => (
                  <SelectItem key={c.id} value={c.id}>{c.name}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          )}
          {type === 'expense' && (
            <Select value={filters.payment_method} onValueChange={(v) => set('payment_method', v)}>
              <SelectTrigger><SelectValue placeholder="Method" /></SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All methods</SelectItem>
                {PAYMENT_METHODS.map((m) => (
                  <SelectItem key={m.value} value={m.value}>{m.label}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          )}
          {type === 'income' && (
            <Select value={filters.source} onValueChange={(v) => set('source', v)}>
              <SelectTrigger><SelectValue placeholder="Source" /></SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All sources</SelectItem>
                {INCOME_SOURCES.map((s) => (
                  <SelectItem key={s.value} value={s.value}>{s.label}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          )}
          <Input type="date" value={filters.from} onChange={(e) => set('from', e.target.value)} />
          <Input type="date" value={filters.to} onChange={(e) => set('to', e.target.value)} />
        </div>
      </Card>

      <div className="space-y-2">
        {filtered.length === 0 && (
          <p className="text-sm text-muted-foreground py-8 text-center">No transactions match your filters.</p>
        )}
        {filtered.map((row) =>
          row._type === 'expense' ? (
            <ExpenseRow
              key={row.id}
              e={row}
              cat={row.category_id ? catMap[row.category_id] : null}
              isOpen={!!expanded[row.id]}
              onToggle={() => setExpanded((s) => ({ ...s, [row.id]: !s[row.id] }))}
              onDelete={() => setDeleteTarget(row)}
            />
          ) : (
            <IncomeRow key={row.id} i={row} onDelete={() => setDeleteTarget(row)} />
          )
        )}
      </div>

      <AlertDialog open={!!deleteTarget} onOpenChange={(open) => !open && setDeleteTarget(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete this transaction?</AlertDialogTitle>
            <AlertDialogDescription>
              {deleteTarget && `"${deleteTarget.description}" — ${fmt(deleteTarget.amount, deleteTarget.currency)}. `}
              This can&apos;t be undone.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction onClick={confirmDelete} className={buttonVariants({ variant: 'destructive' })}>
              Delete
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
