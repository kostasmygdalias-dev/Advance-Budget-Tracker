import { useEffect, useState, useMemo } from 'react';
import { Link, useNavigate, useSearchParams } from 'react-router-dom';
import { entities } from '@/lib/sheetsStore';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Badge } from '@/components/ui/badge';
import { Card } from '@/components/ui/card';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Checkbox } from '@/components/ui/checkbox';
import { Popover, PopoverTrigger, PopoverContent } from '@/components/ui/popover';
import { Tabs, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from '@/components/ui/dropdown-menu';
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent,
  AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle,
} from '@/components/ui/alert-dialog';
import { buttonVariants } from '@/components/ui/button';
import { useToast } from '@/components/ui/use-toast';
import { ToastAction } from '@/components/ui/toast';
import {
  Plus, Search, ChevronDown, ChevronLeft, ChevronRight, Pencil, Copy, Trash2, Layers,
  Download, ListChecks, X, Tags,
} from 'lucide-react';
import { monthLabel, currentMonthStr } from '@/lib/finance';
import { getIncomeSources, INCOME_SOURCE_ICONS } from '@/components/IncomeForm';
import { CategoryIcon, IconAvatar } from '@/lib/categoryIcons';
import { flattenCategoryTree } from '@/lib/categoryTree';
import { downloadCsv } from '@/lib/exportFile';
import { useCategoriesQuery } from '@/hooks/useEntities';
import LoadError from '@/components/LoadError';
import PageSkeleton from '@/components/PageSkeleton';
import { useLanguage } from '@/lib/i18n';

const INCOME_COLOR = '#10b981';

const getPaymentMethods = (t) => [
  { value: 'cash', label: t('common.paymentMethod.cash') },
  { value: 'card', label: t('common.paymentMethod.card') },
  { value: 'bank_transfer', label: t('common.paymentMethod.bank_transfer') },
  { value: 'other', label: t('common.paymentMethod.other') },
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

// Clicking the row's category icon re-categorizes the transaction directly
// from the list — picking a category here changes what the transaction is
// filed under, not the category's own icon (that's the picker on the
// Categories page).
function CategoryPickerButton({ categoryId, cat, categories, onPick }) {
  const { t } = useLanguage();
  const [open, setOpen] = useState(false);
  const color = cat?.color || '#94a3b8';
  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <button type="button" className="rounded-full transition-transform hover:scale-105 focus:outline-none focus-visible:ring-2 focus-visible:ring-ring">
          <IconAvatar icon={(props) => <CategoryIcon name={cat?.icon} {...props} />} color={color} />
        </button>
      </PopoverTrigger>
      <PopoverContent className="w-64 p-1" align="start">
        <div className="max-h-72 overflow-y-auto space-y-0.5">
          <button
            type="button"
            onClick={() => { onPick(null); setOpen(false); }}
            className={`w-full flex items-center gap-2 rounded-md px-2 py-1.5 text-sm hover:bg-muted transition-colors ${!categoryId ? 'bg-muted' : ''}`}
          >
            <IconAvatar icon={(props) => <CategoryIcon name={null} {...props} />} color="#94a3b8" className="w-6 h-6" />
            {t('transactions.uncategorized')}
          </button>
          {flattenCategoryTree(categories).map((c) => (
            <button
              key={c.id}
              type="button"
              onClick={() => { onPick(c.id); setOpen(false); }}
              className={`w-full flex items-center gap-2 rounded-md px-2 py-1.5 text-sm hover:bg-muted transition-colors ${c.depth > 0 ? 'pl-6 text-muted-foreground' : ''} ${c.id === categoryId ? 'bg-muted' : ''}`}
            >
              <IconAvatar icon={(props) => <CategoryIcon name={c.icon} {...props} />} color={c.color} className="w-6 h-6" />
              {c.depth > 0 ? '↳ ' : ''}{c.name}
            </button>
          ))}
        </div>
      </PopoverContent>
    </Popover>
  );
}

function ExpenseRow({ e, cat, categories, onChangeCategory, isOpen, onToggle, onCopy, onDelete, onToggleReconciled, selectMode, selected, onToggleSelect }) {
  const { t, lang } = useLanguage();
  const PAYMENT_METHODS = getPaymentMethods(t);
  const color = cat?.color || '#94a3b8';
  return (
    <Card className="p-0 overflow-hidden" style={{ borderLeft: `4px solid ${color}` }}>
      <div className="flex items-center gap-3 p-4">
        {selectMode ? (
          <Checkbox checked={selected} onCheckedChange={onToggleSelect} />
        ) : (
          <Checkbox checked={!!e.reconciled} onCheckedChange={onToggleReconciled} title={t('transactions.reconciled')} />
        )}
        <button onClick={onToggle} className="text-muted-foreground">
          {e.expense_type === 'amortized' ? (
            isOpen ? <ChevronDown className="w-4 h-4" /> : <ChevronRight className="w-4 h-4" />
          ) : (
            <span className="w-4" />
          )}
        </button>
        <CategoryPickerButton categoryId={e.category_id} cat={cat} categories={categories} onPick={onChangeCategory} />
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 flex-wrap">
            <p className="font-medium truncate">{e.description}</p>
            {e.expense_type === 'amortized' && (
              <Badge variant="secondary" className="gap-1">
                <Layers className="w-3 h-3" /> {t('transactions.amortized')}
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
          <Button variant="ghost" size="icon" aria-label={t('transactions.editTransaction', { description: e.description })}><Pencil className="w-4 h-4" /></Button>
        </Link>
        <Button variant="ghost" size="icon" onClick={onCopy} aria-label={t('transactions.copyTransaction', { description: e.description })}><Copy className="w-4 h-4" /></Button>
        <Button variant="ghost" size="icon" onClick={onDelete} aria-label={t('transactions.deleteTransaction', { description: e.description })}><Trash2 className="w-4 h-4" /></Button>
      </div>
      {e.expense_type === 'amortized' && isOpen && (e.amortization_schedule || []).length > 0 && (
        <div className="border-t bg-muted/30 p-4">
          <p className="text-xs uppercase tracking-wide text-muted-foreground mb-2">
            {t('transactions.scheduleHeading', { value: e.period_value, unit: t(`expenseForm.units.${e.period_unit}`) })}
          </p>
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
            {e.amortization_schedule.map((s) => (
              <div key={s.month} className="flex justify-between text-sm rounded bg-background border px-3 py-2">
                <span className="text-muted-foreground">{monthLabel(s.month, lang)}</span>
                <span className="font-medium tabular-nums">{s.amount.toFixed(2)}</span>
              </div>
            ))}
          </div>
        </div>
      )}
    </Card>
  );
}

function IncomeRow({ i, onCopy, onDelete, onToggleReconciled, selectMode, selected, onToggleSelect }) {
  const { t } = useLanguage();
  const incomeSources = getIncomeSources(t);
  const SourceIcon = INCOME_SOURCE_ICONS[i.source] || INCOME_SOURCE_ICONS.other;
  return (
    <Card className="p-0 overflow-hidden" style={{ borderLeft: `4px solid ${INCOME_COLOR}` }}>
      <div className="flex items-center gap-3 p-4">
        {selectMode ? (
          <Checkbox checked={selected} onCheckedChange={onToggleSelect} />
        ) : (
          <Checkbox checked={!!i.reconciled} onCheckedChange={onToggleReconciled} title={t('transactions.reconciled')} />
        )}
        <IconAvatar icon={SourceIcon} color={INCOME_COLOR} />
        <div className="flex-1 min-w-0">
          <p className="font-medium truncate">{i.description}</p>
          <p className="text-xs text-muted-foreground mt-0.5">
            {incomeSources.find((s) => s.value === i.source)?.label || i.source} · {i.received_date}
            {(i.tags || []).length > 0 && ` · ${i.tags.join(', ')}`}
          </p>
        </div>
        <div className="text-right">
          <p className="font-semibold tabular-nums text-emerald-600">+{fmt(i.amount, i.currency)}</p>
        </div>
        <Link to={`/income/${i.id}/edit`}>
          <Button variant="ghost" size="icon" aria-label={t('transactions.editTransaction', { description: i.description })}><Pencil className="w-4 h-4" /></Button>
        </Link>
        <Button variant="ghost" size="icon" onClick={onCopy} aria-label={t('transactions.copyTransaction', { description: i.description })}><Copy className="w-4 h-4" /></Button>
        <Button variant="ghost" size="icon" onClick={onDelete} aria-label={t('transactions.deleteTransaction', { description: i.description })}><Trash2 className="w-4 h-4" /></Button>
      </div>
    </Card>
  );
}

export default function Transactions() {
  const navigate = useNavigate();
  const { toast } = useToast();
  const { t, lang } = useLanguage();
  const incomeSources = getIncomeSources(t);
  const [searchParams, setSearchParams] = useSearchParams();
  const initialType = ['income', 'expense'].includes(searchParams.get('type')) ? searchParams.get('type') : 'all';
  // Month-first browsing by default (like the month navigator this mirrors) —
  // "all time" is an explicit opt-out (?month=all), not the starting point.
  const monthParam = searchParams.get('month');
  const initialMonth = monthParam === 'all' ? null : (monthParam || currentMonthStr());

  const [expenses, setExpenses] = useState([]);
  const [incomes, setIncomes] = useState([]);
  const [txLoading, setTxLoading] = useState(true);
  const [txError, setTxError] = useState(null);
  const catQuery = useCategoriesQuery();
  const categories = catQuery.data || [];
  const loading = txLoading || catQuery.isLoading;
  const loadError = txError || catQuery.error;
  const [expanded, setExpanded] = useState({});
  const [type, setType] = useState(initialType);
  const [month, setMonth] = useState(initialMonth);
  const [selectMode, setSelectMode] = useState(false);
  const [selected, setSelected] = useState(new Set());
  const [bulkDeleteOpen, setBulkDeleteOpen] = useState(false);
  const [filters, setFilters] = useState({
    search: '', category_id: searchParams.get('category') || 'all', payment_method: 'all', source: 'all',
  });
  // An explicit alternative to month-browsing — either bound can be set
  // alone (open-ended) or both together. Takes over from `month` entirely
  // while either is non-empty.
  const [dateRange, setDateRange] = useState({ from: '', to: '' });
  const [customRangeOpen, setCustomRangeOpen] = useState(false);
  const clearCustomRange = () => {
    setDateRange({ from: '', to: '' });
    setCustomRangeOpen(false);
  };

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

  // Selecting a parent category rolls up to include its subcategories too —
  // otherwise "Transport" would only match transactions tagged to Transport
  // itself, never Fuel/Parking underneath it.
  const categoryFilterIds = useMemo(() => {
    if (filters.category_id === 'all' || filters.category_id === 'uncategorized') return null;
    const ids = new Set([filters.category_id]);
    categories.forEach((c) => { if (c.parent_id === filters.category_id) ids.add(c.id); });
    return ids;
  }, [filters.category_id, categories]);

  const filtered = useMemo(() => {
    const hasCustomRange = dateRange.from || dateRange.to;
    return combined.filter((row) => {
      if (hasCustomRange) {
        if (dateRange.from && (row._date || '') < dateRange.from) return false;
        if (dateRange.to && (row._date || '') > dateRange.to) return false;
      } else if (month && !(row._date || '').startsWith(month)) return false;
      if (type !== 'all' && row._type !== type) return false;
      if (filters.search && !(row.description || '').toLowerCase().includes(filters.search.toLowerCase())) return false;
      if (row._type === 'expense') {
        if (filters.category_id === 'uncategorized' && row.category_id) return false;
        if (categoryFilterIds && !categoryFilterIds.has(row.category_id)) return false;
        if (filters.payment_method !== 'all' && row.payment_method !== filters.payment_method) return false;
      } else {
        // A category filter is expense-only — no income row can ever match
        // a specific category or "uncategorized," so filter them all out
        // rather than silently ignoring the filter for this type.
        if (filters.category_id !== 'all') return false;
        if (filters.source !== 'all' && row.source !== filters.source) return false;
      }
      return true;
    });
  }, [combined, type, month, filters, dateRange, categoryFilterIds]);

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
      toast({ title: t('transactions.copied'), description: t('transactions.copiedDescription') });
    } catch (err) {
      toast({ title: t('transactions.couldNotCopy'), description: err.message, variant: 'destructive' });
    }
  };

  const changeCategory = async (row, categoryId) => {
    const previous = row.category_id;
    setExpenses((prev) => prev.map((e) => (e.id === row.id ? { ...e, category_id: categoryId } : e)));
    try {
      await entities.Expense.update(row.id, { category_id: categoryId });
    } catch (err) {
      setExpenses((prev) => prev.map((e) => (e.id === row.id ? { ...e, category_id: previous } : e)));
      toast({ title: t('common.couldNotSave'), description: err.message, variant: 'destructive' });
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
      toast({ title: t('common.couldNotUpdate'), description: err.message, variant: 'destructive' });
    }
  };

  // Optimistic delete with an Undo action, instead of a confirm dialog —
  // faster for the common case, and just as safe since Undo re-creates the
  // row (as a new record; Sheets rows have no stable way to "un-delete").
  const undoDelete = async (row) => {
    try {
      const created = row._type === 'expense' ? await entities.Expense.create(row) : await entities.Income.create(row);
      if (row._type === 'expense') setExpenses((prev) => [...prev, created]);
      else setIncomes((prev) => [...prev, created]);
      toast({ title: t('transactions.restoredToastTitle') });
    } catch (err) {
      toast({ title: t('transactions.couldNotRestore'), description: err.message, variant: 'destructive' });
    }
  };

  const deleteRow = async (row) => {
    if (row._type === 'expense') setExpenses((prev) => prev.filter((e) => e.id !== row.id));
    else setIncomes((prev) => prev.filter((i) => i.id !== row.id));
    try {
      if (row._type === 'expense') await entities.Expense.delete(row.id);
      else await entities.Income.delete(row.id);
      toast({
        title: t('transactions.deletedToastTitle'),
        description: t('transactions.deletedToastDescription', { description: row.description }),
        action: <ToastAction altText={t('transactions.undo')} onClick={() => undoDelete(row)}>{t('transactions.undo')}</ToastAction>,
      });
    } catch (err) {
      if (row._type === 'expense') setExpenses((prev) => [...prev, row]);
      else setIncomes((prev) => [...prev, row]);
      toast({ title: t('common.couldNotDelete'), description: err.message, variant: 'destructive' });
    }
  };

  const selectionKey = (row) => `${row._type}:${row.id}`;
  const selectedRows = useMemo(() => combined.filter((r) => selected.has(selectionKey(r))), [combined, selected]);

  const toggleSelectMode = () => {
    setSelectMode((v) => !v);
    setSelected(new Set());
  };

  const toggleSelect = (row) => {
    const key = selectionKey(row);
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(key)) next.delete(key);
      else next.add(key);
      return next;
    });
  };

  const selectAllFiltered = () => setSelected(new Set(filtered.map(selectionKey)));
  const clearSelection = () => setSelected(new Set());

  const bulkDelete = async () => {
    const rows = selectedRows;
    setBulkDeleteOpen(false);
    try {
      await Promise.all(rows.map((r) => (r._type === 'expense' ? entities.Expense.delete(r.id) : entities.Income.delete(r.id))));
      setExpenses((prev) => prev.filter((e) => !selected.has(selectionKey({ ...e, _type: 'expense' }))));
      setIncomes((prev) => prev.filter((i) => !selected.has(selectionKey({ ...i, _type: 'income' }))));
      toast({ title: rows.length === 1 ? t('transactions.bulkDeletedOne', { count: 1 }) : t('transactions.bulkDeletedOther', { count: rows.length }) });
      toggleSelectMode();
    } catch (err) {
      toast({ title: t('transactions.couldNotBulkDelete'), description: err.message, variant: 'destructive' });
      load();
    }
  };

  const bulkRecategorize = async (categoryId) => {
    const rows = selectedRows.filter((r) => r._type === 'expense');
    try {
      await Promise.all(rows.map((r) => entities.Expense.update(r.id, { category_id: categoryId })));
      const expenseKeys = new Set(rows.map(selectionKey));
      setExpenses((prev) => prev.map((e) => (expenseKeys.has(selectionKey({ ...e, _type: 'expense' })) ? { ...e, category_id: categoryId } : e)));
      toast({ title: rows.length === 1 ? t('transactions.bulkRecategorizedOne', { count: 1 }) : t('transactions.bulkRecategorizedOther', { count: rows.length }) });
      toggleSelectMode();
    } catch (err) {
      toast({ title: t('transactions.couldNotBulkRecategorize'), description: err.message, variant: 'destructive' });
      load();
    }
  };

  const exportCsv = () => {
    const PAYMENT_METHODS = getPaymentMethods(t);
    const columns = [
      { key: 'type', label: t('transactions.csvType') },
      { key: 'date', label: t('transactions.csvDate') },
      { key: 'description', label: t('transactions.csvDescription') },
      { key: 'category', label: t('transactions.csvCategory') },
      { key: 'amount', label: t('transactions.csvAmount') },
      { key: 'currency', label: t('transactions.csvCurrency') },
      { key: 'methodOrSource', label: t('transactions.csvMethodOrSource') },
      { key: 'notes', label: t('transactions.csvNotes') },
      { key: 'reconciled', label: t('transactions.csvReconciled') },
    ];
    const rows = filtered.map((row) => ({
      type: row._type === 'income' ? t('common.income') : t('common.expense'),
      date: row._date || '',
      description: row.description || '',
      category: row._type === 'expense' ? (row.category_id ? catMap[row.category_id]?.name || '' : t('transactions.uncategorized')) : '',
      amount: row.amount,
      currency: row.currency,
      methodOrSource: row._type === 'expense'
        ? (PAYMENT_METHODS.find((m) => m.value === row.payment_method)?.label || row.payment_method)
        : (incomeSources.find((s) => s.value === row.source)?.label || row.source),
      notes: row.notes || '',
      reconciled: row.reconciled ? t('transactions.csvReconciled') : '',
    }));
    downloadCsv(`transactions-${todayStr()}.csv`, columns, rows);
  };

  if (loading) return <PageSkeleton />;
  if (loadError) return <LoadError error={loadError} onRetry={retryAll} />;

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between flex-wrap gap-3">
        <h1 className="text-2xl font-heading font-semibold tracking-tight">{t('transactions.title')}</h1>
        <div className="flex items-center gap-2">
          <Button variant="outline" onClick={exportCsv}>
            <Download className="w-4 h-4 mr-1" /> {t('transactions.exportCsv')}
          </Button>
          <Button variant={selectMode ? 'secondary' : 'outline'} onClick={toggleSelectMode}>
            {selectMode ? <X className="w-4 h-4 mr-1" /> : <ListChecks className="w-4 h-4 mr-1" />}
            {selectMode ? t('transactions.cancelSelect') : t('transactions.select')}
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

      {selectMode && (
        <Card className="p-3 flex items-center justify-between gap-3 flex-wrap">
          <div className="flex items-center gap-3">
            <p className="text-sm font-medium tabular-nums">
              {selected.size === 1 ? t('transactions.selectedCountOne', { count: 1 }) : t('transactions.selectedCountOther', { count: selected.size })}
            </p>
            <Button variant="ghost" size="sm" onClick={selectAllFiltered}>{t('transactions.selectAll')}</Button>
            {selected.size > 0 && <Button variant="ghost" size="sm" onClick={clearSelection}>{t('common.cancel')}</Button>}
          </div>
          {selected.size > 0 && (
            <div className="flex items-center gap-2">
              {selectedRows.some((r) => r._type === 'expense') && (
                <Popover>
                  <PopoverTrigger asChild>
                    <Button variant="outline" size="sm"><Tags className="w-4 h-4 mr-1" /> {t('transactions.bulkRecategorize')}</Button>
                  </PopoverTrigger>
                  <PopoverContent className="w-64 p-1" align="end">
                    <div className="max-h-72 overflow-y-auto space-y-0.5">
                      <button
                        type="button"
                        onClick={() => bulkRecategorize(null)}
                        className="w-full flex items-center gap-2 rounded-md px-2 py-1.5 text-sm hover:bg-muted transition-colors"
                      >
                        <IconAvatar icon={(props) => <CategoryIcon name={null} {...props} />} color="#94a3b8" className="w-6 h-6" />
                        {t('transactions.uncategorized')}
                      </button>
                      {flattenCategoryTree(categories).map((c) => (
                        <button
                          key={c.id}
                          type="button"
                          onClick={() => bulkRecategorize(c.id)}
                          className={`w-full flex items-center gap-2 rounded-md px-2 py-1.5 text-sm hover:bg-muted transition-colors ${c.depth > 0 ? 'pl-6 text-muted-foreground' : ''}`}
                        >
                          <IconAvatar icon={(props) => <CategoryIcon name={c.icon} {...props} />} color={c.color} className="w-6 h-6" />
                          {c.depth > 0 ? '↳ ' : ''}{c.name}
                        </button>
                      ))}
                    </div>
                  </PopoverContent>
                </Popover>
              )}
              <Button variant="destructive" size="sm" onClick={() => setBulkDeleteOpen(true)}>
                <Trash2 className="w-4 h-4 mr-1" /> {t('transactions.bulkDelete')}
              </Button>
            </div>
          )}
        </Card>
      )}

      <Card className="p-3 space-y-2">
        {customRangeOpen ? (
          <div className="flex items-end gap-3 flex-wrap">
            <div className="space-y-1.5">
              <Label htmlFor="txn-from" className="text-xs">{t('reports.from')}</Label>
              <Input
                id="txn-from" type="date" value={dateRange.from}
                onChange={(e) => setDateRange((r) => ({ ...r, from: e.target.value }))}
                className="w-40"
              />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="txn-to" className="text-xs">{t('reports.to')}</Label>
              <Input
                id="txn-to" type="date" value={dateRange.to}
                onChange={(e) => setDateRange((r) => ({ ...r, to: e.target.value }))}
                className="w-40"
              />
            </div>
            <Button variant="ghost" size="sm" onClick={clearCustomRange}>{t('transactions.useMonthView')}</Button>
          </div>
        ) : (
          <div className="flex items-center justify-between gap-3">
            {month ? (
              <>
                <Button variant="ghost" size="icon" onClick={() => changeMonth(shiftMonth(month, -1))}>
                  <ChevronLeft className="w-4 h-4" />
                </Button>
                <button onClick={() => changeMonth(null)} className="text-sm font-medium hover:underline">
                  {monthLabel(month, lang)}
                </button>
                <Button variant="ghost" size="icon" onClick={() => changeMonth(shiftMonth(month, 1))}>
                  <ChevronRight className="w-4 h-4" />
                </Button>
              </>
            ) : (
              <>
                <span />
                <button onClick={() => changeMonth(currentMonthStr())} className="text-sm font-medium hover:underline">
                  {t('transactions.allTime')}
                </button>
                <span />
              </>
            )}
          </div>
        )}
        {!customRangeOpen && (
          <div className="flex justify-center">
            <button onClick={() => setCustomRangeOpen(true)} className="text-xs text-muted-foreground hover:underline">
              {t('transactions.customRange')}
            </button>
          </div>
        )}
      </Card>

      <div className="flex items-center justify-between flex-wrap gap-3">
        <Tabs value={type} onValueChange={changeType}>
          <TabsList>
            <TabsTrigger value="all">{t('transactions.tabAll')}</TabsTrigger>
            <TabsTrigger value="income">{t('transactions.tabIncome')}</TabsTrigger>
            <TabsTrigger value="expense">{t('transactions.tabExpenses')}</TabsTrigger>
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
            placeholder={t('transactions.searchPlaceholder')}
            className="pl-9"
          />
        </div>
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
          {type !== 'income' && (
            <Select value={filters.category_id} onValueChange={(v) => set('category_id', v)}>
              <SelectTrigger><SelectValue placeholder={t('transactions.categoryPlaceholder')} /></SelectTrigger>
              <SelectContent>
                <SelectItem value="all">{t('transactions.allCategories')}</SelectItem>
                <SelectItem value="uncategorized">{t('transactions.uncategorized')}</SelectItem>
                {flattenCategoryTree(categories).map((c) => (
                  <SelectItem key={c.id} value={c.id} className={c.depth > 0 ? 'pl-6 text-muted-foreground' : ''}>
                    {c.depth > 0 ? '↳ ' : ''}{c.name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          )}
          {type === 'expense' && (
            <Select value={filters.payment_method} onValueChange={(v) => set('payment_method', v)}>
              <SelectTrigger><SelectValue placeholder={t('transactions.methodPlaceholder')} /></SelectTrigger>
              <SelectContent>
                <SelectItem value="all">{t('transactions.allMethods')}</SelectItem>
                {getPaymentMethods(t).map((m) => (
                  <SelectItem key={m.value} value={m.value}>{m.label}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          )}
          {type === 'income' && (
            <Select value={filters.source} onValueChange={(v) => set('source', v)}>
              <SelectTrigger><SelectValue placeholder={t('transactions.sourcePlaceholder')} /></SelectTrigger>
              <SelectContent>
                <SelectItem value="all">{t('transactions.allSources')}</SelectItem>
                {incomeSources.map((s) => (
                  <SelectItem key={s.value} value={s.value}>{s.label}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          )}
        </div>
      </Card>

      <div className="space-y-2">
        {filtered.length === 0 && (
          <p className="text-sm text-muted-foreground py-8 text-center">{t('transactions.noMatches')}</p>
        )}
        {filtered.map((row) =>
          row._type === 'expense' ? (
            <ExpenseRow
              key={row.id}
              e={row}
              cat={row.category_id ? catMap[row.category_id] : null}
              categories={categories}
              onChangeCategory={(categoryId) => changeCategory(row, categoryId)}
              isOpen={!!expanded[row.id]}
              onToggle={() => setExpanded((s) => ({ ...s, [row.id]: !s[row.id] }))}
              onCopy={() => copyRow(row)}
              onDelete={() => deleteRow(row)}
              onToggleReconciled={() => toggleReconciled(row)}
              selectMode={selectMode}
              selected={selected.has(selectionKey(row))}
              onToggleSelect={() => toggleSelect(row)}
            />
          ) : (
            <IncomeRow
              key={row.id}
              i={row}
              onCopy={() => copyRow(row)}
              onDelete={() => deleteRow(row)}
              onToggleReconciled={() => toggleReconciled(row)}
              selectMode={selectMode}
              selected={selected.has(selectionKey(row))}
              onToggleSelect={() => toggleSelect(row)}
            />
          )
        )}
      </div>

      <AlertDialog open={bulkDeleteOpen} onOpenChange={setBulkDeleteOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>
              {selected.size === 1 ? t('transactions.bulkDeleteConfirmTitleOne') : t('transactions.bulkDeleteConfirmTitleOther', { count: selected.size })}
            </AlertDialogTitle>
            <AlertDialogDescription>{t('transactions.bulkDeleteConfirmBody')}</AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>{t('common.cancel')}</AlertDialogCancel>
            <AlertDialogAction onClick={bulkDelete} className={buttonVariants({ variant: 'destructive' })}>
              {t('common.delete')}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
