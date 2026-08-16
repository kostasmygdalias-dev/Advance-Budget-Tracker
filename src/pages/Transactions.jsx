import { useEffect, useState, useMemo } from 'react';
import { Link, useNavigate, useSearchParams } from 'react-router-dom';
import { entities } from '@/lib/sheetsStore';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import { Card } from '@/components/ui/card';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Checkbox } from '@/components/ui/checkbox';
import { Tabs, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from '@/components/ui/dropdown-menu';
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent,
  AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle,
} from '@/components/ui/alert-dialog';
import { buttonVariants } from '@/components/ui/button';
import { useToast } from '@/components/ui/use-toast';
import { Plus, Search, ChevronDown, ChevronLeft, ChevronRight, Pencil, Copy, Trash2, Layers } from 'lucide-react';
import { monthLabel, currentMonthStr } from '@/lib/finance';
import { INCOME_SOURCES, INCOME_SOURCE_ICONS } from '@/components/IncomeForm';
import { CategoryIcon, IconAvatar } from '@/lib/categoryIcons';
import LoadError from '@/components/LoadError';
import PageSkeleton from '@/components/PageSkeleton';

const INCOME_COLOR = '#10b981';

const PAYMENT_METHODS = [
  { value: 'cash', label: 'Cash' },
  { value: 'card', label: 'Card' },
  { value: 'bank_transfer', label: 'Bank transfer' },
  { value: 'other', label: 'Other' },
];

const fmt = (n, c = 'EUR') => `${(n || 0).toFixed(2)} ${c}`;

const pad2 = (n) => String(n).padStart(2, '0');
// Local date, not UTC — toISOString() would show yesterday's/tomorrow's date
// for users behind/ahead of UTC around midnight (same approach as IncomeForm).
const todayStr = () => {
  const d = new Date();
  return `${d.getFullYear()}-${pad2(d.getMonth() + 1)}-${pad2(d.getDate())}`;
};

function shiftMonth(monthStr, delta) {
  const [y, m] = monthStr.split('-').map(Number);
  const d = new Date(y, m - 1 + delta, 1);
  return `${d.getFullYear()}-${pad2(d.getMonth() + 1)}`;
}

function ExpenseRow({ e, cat, isOpen, onToggle, onCopy, onDelete, onToggleReconciled }) {
  const color = cat?.color || '#94a3b8';
  return (
    <Card className="p-0 overflow-hidden" style={{ borderLeft: `4px solid ${color}` }}>
      <div className="flex items-center gap-3 p-4">
        <Checkbox checked={!!e.reconciled} onCheckedChange={onToggleReconciled} title="Reconciled" />
        <button onClick={onToggle} className="text-muted-foreground">
          {e.expense_type === 'amortized' ? (
            isOpen ? <ChevronDown className="w-4 h-4" /> : <ChevronRight className="w-4 h-4" />
          ) : (
            <span className="w-4" />
          )}
        </button>
        <IconAvatar icon={(props) => <CategoryIcon name={cat?.icon} {...props} />} color={color} />
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 flex-wrap">
            <p className="font-medium truncate">{e.description}</p>
            {e.expense_type === 'amortized' && (
              <Badge variant="secondary" className="gap-1">
                <Layers className="w-3 h-3" /> Amortized
              </Badge>
            )}
          </div>
          <p className="text-xs text-muted-foreground mt-0.5">
            {cat ? `${cat.name} · ` : ''}{e.paid_date} · {PAYMENT_METHODS.find((m) => m.value === e.payment_method)?.label || e.payment_method}
            {(e.tags || []).length > 0 && ` · ${e.tags.join(', ')}`}
          </p>
        </div>
        <div className="text-right">
          <p className="font-semibold tabular-nums">{fmt(e.amount, e.currency)}</p>
        </div>
        <Link to={`/expenses/${e.id}/edit`}>
          <Button variant="ghost" size="icon"><Pencil className="w-4 h-4" /></Button>
        </Link>
        <Button variant="ghost" size="icon" onClick={onCopy}><Copy className="w-4 h-4" /></Button>
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

function IncomeRow({ i, onCopy, onDelete, onToggleReconciled }) {
  const SourceIcon = INCOME_SOURCE_ICONS[i.source] || INCOME_SOURCE_ICONS.other;
  return (
    <Card className="p-0 overflow-hidden" style={{ borderLeft: `4px solid ${INCOME_COLOR}` }}>
      <div className="flex items-center gap-3 p-4">
        <Checkbox checked={!!i.reconciled} onCheckedChange={onToggleReconciled} title="Reconciled" />
        <IconAvatar icon={SourceIcon} color={INCOME_COLOR} />
        <div className="flex-1 min-w-0">
          <p className="font-medium truncate">{i.description}</p>
          <p className="text-xs text-muted-foreground mt-0.5">
            {INCOME_SOURCES.find((s) => s.value === i.source)?.label || i.source} · {i.received_date}
            {(i.tags || []).length > 0 && ` · ${i.tags.join(', ')}`}
          </p>
        </div>
        <div className="text-right">
          <p className="font-semibold tabular-nums text-emerald-600">+{fmt(i.amount, i.currency)}</p>
        </div>
        <Link to={`/income/${i.id}/edit`}>
          <Button variant="ghost" size="icon"><Pencil className="w-4 h-4" /></Button>
        </Link>
        <Button variant="ghost" size="icon" onClick={onCopy}><Copy className="w-4 h-4" /></Button>
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
  // Month-first browsing by default (like the month navigator this mirrors) —
  // "all time" is an explicit opt-out (?month=all), not the starting point.
  const monthParam = searchParams.get('month');
  const initialMonth = monthParam === 'all' ? null : (monthParam || currentMonthStr());

  const [expenses, setExpenses] = useState([]);
  const [incomes, setIncomes] = useState([]);
  const [categories, setCategories] = useState([]);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState(null);
  const [expanded, setExpanded] = useState({});
  const [type, setType] = useState(initialType);
  const [month, setMonth] = useState(initialMonth);
  const [deleteTarget, setDeleteTarget] = useState(null);
  const [filters, setFilters] = useState({
    search: '', category_id: 'all', payment_method: 'all', source: 'all',
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

  const syncParams = (nextType, nextMonth) => {
    const params = {};
    if (nextType !== 'all') params.type = nextType;
    if (nextMonth === null) params.month = 'all';
    else if (nextMonth !== currentMonthStr()) params.month = nextMonth;
    setSearchParams(params, { replace: true });
  };

  const changeType = (next) => {
    setType(next);
    syncParams(next, month);
  };

  const changeMonth = (next) => {
    setMonth(next);
    syncParams(type, next);
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
      if (month && !(row._date || '').startsWith(month)) return false;
      if (type !== 'all' && row._type !== type) return false;
      if (filters.search && !(row.description || '').toLowerCase().includes(filters.search.toLowerCase())) return false;
      if (row._type === 'expense') {
        if (filters.category_id !== 'all' && row.category_id !== filters.category_id) return false;
        if (filters.payment_method !== 'all' && row.payment_method !== filters.payment_method) return false;
      } else if (filters.source !== 'all' && row.source !== filters.source) return false;
      return true;
    });
  }, [combined, type, month, filters]);

  // Grouped by currency rather than blindly summed — mixing currencies into
  // one number would be silently wrong (same reasoning as the Dashboard fix).
  const filteredTotals = useMemo(() => {
    const byCurrency = {};
    filtered.forEach((row) => {
      const cur = row.currency || 'EUR';
      const signed = row._type === 'income' ? row.amount : -row.amount;
      byCurrency[cur] = (byCurrency[cur] || 0) + signed;
    });
    return byCurrency;
  }, [filtered]);

  const set = (k, v) => setFilters((f) => ({ ...f, [k]: v }));

  const copyRow = async (row) => {
    try {
      if (row._type === 'expense') {
        await entities.Expense.create({
          description: row.description,
          amount: row.amount,
          currency: row.currency,
          paid_date: todayStr(),
          category_id: row.category_id,
          payment_method: row.payment_method,
          notes: row.notes,
          tags: row.tags,
          expense_type: 'single',
          amortization_schedule: [],
        });
      } else {
        await entities.Income.create({
          description: row.description,
          amount: row.amount,
          currency: row.currency,
          received_date: todayStr(),
          source: row.source,
          notes: row.notes,
          tags: row.tags,
        });
      }
      load();
      toast({ title: 'Copied', description: `Added a new entry dated today.` });
    } catch (err) {
      toast({ title: 'Could not copy', description: err.message, variant: 'destructive' });
    }
  };

  const toggleReconciled = async (row) => {
    try {
      if (row._type === 'expense') {
        await entities.Expense.update(row.id, { reconciled: !row.reconciled });
        setExpenses((prev) => prev.map((e) => (e.id === row.id ? { ...e, reconciled: !e.reconciled } : e)));
      } else {
        await entities.Income.update(row.id, { reconciled: !row.reconciled });
        setIncomes((prev) => prev.map((i) => (i.id === row.id ? { ...i, reconciled: !i.reconciled } : i)));
      }
    } catch (err) {
      toast({ title: 'Could not update', description: err.message, variant: 'destructive' });
    }
  };

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

      <Card className="p-3 flex items-center justify-between gap-3">
        {month ? (
          <>
            <Button variant="ghost" size="icon" onClick={() => changeMonth(shiftMonth(month, -1))}>
              <ChevronLeft className="w-4 h-4" />
            </Button>
            <button onClick={() => changeMonth(null)} className="text-sm font-medium hover:underline">
              {monthLabel(month)}
            </button>
            <Button variant="ghost" size="icon" onClick={() => changeMonth(shiftMonth(month, 1))}>
              <ChevronRight className="w-4 h-4" />
            </Button>
          </>
        ) : (
          <>
            <span />
            <button onClick={() => changeMonth(currentMonthStr())} className="text-sm font-medium hover:underline">
              All time
            </button>
            <span />
          </>
        )}
      </Card>

      <div className="flex items-center justify-between flex-wrap gap-3">
        <Tabs value={type} onValueChange={changeType}>
          <TabsList>
            <TabsTrigger value="all">All</TabsTrigger>
            <TabsTrigger value="income">Income</TabsTrigger>
            <TabsTrigger value="expense">Expenses</TabsTrigger>
          </TabsList>
        </Tabs>
        <p className="text-sm text-muted-foreground tabular-nums">
          {filtered.length} · {Object.entries(filteredTotals).map(([cur, val]) => fmt(val, cur)).join(', ') || fmt(0)}
        </p>
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
              onCopy={() => copyRow(row)}
              onDelete={() => setDeleteTarget(row)}
              onToggleReconciled={() => toggleReconciled(row)}
            />
          ) : (
            <IncomeRow
              key={row.id}
              i={row}
              onCopy={() => copyRow(row)}
              onDelete={() => setDeleteTarget(row)}
              onToggleReconciled={() => toggleReconciled(row)}
            />
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
