import { useEffect, useState } from 'react';
import { entities, deleteRecurringTemplateWithHistory } from '@/lib/sheetsStore';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Card } from '@/components/ui/card';
import { Switch } from '@/components/ui/switch';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from '@/components/ui/dropdown-menu';
import {
  AlertDialog, AlertDialogContent, AlertDialogHeader, AlertDialogTitle,
  AlertDialogDescription, AlertDialogFooter, AlertDialogCancel,
} from '@/components/ui/alert-dialog';
import { buttonVariants } from '@/components/ui/button';
import { useToast } from '@/components/ui/use-toast';
import { Plus, Pencil, Trash2, X, Pause, ChevronDown } from 'lucide-react';
import { addDays, addMonths, addWeeks, subDays, subMonths, subWeeks, differenceInCalendarMonths, format } from 'date-fns';
import { BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer, Cell } from 'recharts';
import { getIncomeSources } from '@/components/IncomeForm';
import { shortMonth, parseDateLocal, fmt, CURRENCIES } from '@/lib/finance';
import { flattenCategoryTree } from '@/lib/categoryTree';
import { useCategoriesQuery } from '@/hooks/useEntities';
import LoadError from '@/components/LoadError';
import PageSkeleton from '@/components/PageSkeleton';
import UpgradePrompt from '@/components/UpgradePrompt';
import { useSubscription } from '@/hooks/use-subscription';
import { useLanguage } from '@/lib/i18n';

const getFrequencies = (t) => [
  { value: 'daily', label: t('recurring.frequency.daily') },
  { value: 'weekly', label: t('recurring.frequency.weekly') },
  { value: 'monthly', label: t('recurring.frequency.monthly') },
  { value: 'custom_days', label: t('recurring.frequency.custom_days') },
];

const getTypes = (t) => [
  { value: 'expense', label: t('common.expense') },
  { value: 'income', label: t('common.income') },
];

function advanceDate(dateStr, frequency, customDays) {
  // Parse as local calendar components, not `new Date(dateStr)` (UTC midnight),
  // which can roll a month-start date back a day for timezones west of UTC.
  const d = parseDateLocal(dateStr);
  if (frequency === 'daily') return addDays(d, 1);
  if (frequency === 'weekly') return addWeeks(d, 1);
  if (frequency === 'monthly') return addMonths(d, 1);
  return addDays(d, customDays || 1);
}

function regressDate(dateStr, frequency, customDays) {
  const d = parseDateLocal(dateStr);
  if (frequency === 'daily') return subDays(d, 1);
  if (frequency === 'weekly') return subWeeks(d, 1);
  if (frequency === 'monthly') return subMonths(d, 1);
  return subDays(d, customDays || 1);
}

// How far through the current billing cycle a template is — cycle start is
// simply one frequency-step before next_due_date (there's no separate
// "last generated" field stored, but that's exactly what next_due_date
// minus one period represents).
function cycleProgress(t) {
  const cycleEnd = parseDateLocal(t.next_due_date);
  const cycleStart = regressDate(t.next_due_date, t.frequency, t.custom_interval_days);
  const today = new Date();
  const totalMs = cycleEnd - cycleStart;
  const elapsedMs = Math.min(Math.max(today - cycleStart, 0), totalMs);
  const pct = totalMs > 0 ? Math.min(100, (elapsedMs / totalMs) * 100) : 0;
  const daysLeft = Math.max(0, Math.ceil((cycleEnd - today) / 86400000));
  return { pct, daysLeft };
}

// Occurrences per year for each frequency, so any cadence can be normalized
// to a single "costs you this much a year" figure.
const OCCURRENCES_PER_YEAR = { daily: 365, weekly: 52, monthly: 12 };
function annualAmount(t) {
  const perYear = OCCURRENCES_PER_YEAR[t.frequency] ?? 365 / (t.custom_interval_days || 1);
  return t.amount * perYear;
}

// Net cash-flow forecast from active templates — simulates each one forward
// from its next occurrence rather than just multiplying by a rate, so an
// annual charge (e.g. one €60 renewal) shows up as a single spike in the
// month it actually lands, not smoothed into every month.
function forecastRecurring(templates, defaultCurrency, lang) {
  const relevant = templates.filter((t) => t.active && (t.currency || defaultCurrency) === defaultCurrency);
  const today = new Date();
  const in30 = addDays(today, 30);
  const in365 = addDays(today, 365);
  const monthly = Array.from({ length: 12 }, (_, i) => ({ label: shortMonth(addMonths(today, i), lang), total: 0 }));
  let next30 = 0;
  let next365 = 0;
  const excludedCurrencies = new Set(
    templates.filter((t) => t.active && (t.currency || defaultCurrency) !== defaultCurrency).map((t) => t.currency)
  );

  relevant.forEach((t) => {
    const signed = t.type === 'income' ? t.amount : -t.amount;
    let d = parseDateLocal(t.next_due_date);
    let iterations = 0;
    while (d <= in365 && iterations < 400) {
      if (d <= in30) next30 += signed;
      next365 += signed;
      const idx = differenceInCalendarMonths(d, today);
      if (idx >= 0 && idx < 12) monthly[idx].total += signed;
      d = advanceDate(format(d, 'yyyy-MM-dd'), t.frequency, t.custom_interval_days);
      iterations++;
    }
  });

  return { next30, next365, monthlyAvg: next365 / 12, monthly, excludedCount: excludedCurrencies.size };
}

export default function Recurring() {
  const { toast } = useToast();
  // Aliased to `tr` — this file already uses `t` everywhere as the loop/param
  // name for a recurring template, so `t()` for translation would collide.
  const { t: tr, lang } = useLanguage();
  const FREQUENCIES = getFrequencies(tr);
  const TYPES = getTypes(tr);
  const incomeSources = getIncomeSources(tr);
  const { active: subActive, loading: subLoading, configured: billingConfigured, upgradeUrl } = useSubscription();
  const catQuery = useCategoriesQuery();
  const categories = catQuery.data || [];
  const [templates, setTemplates] = useState([]);
  const [defaultCurrency, setDefaultCurrency] = useState('EUR');
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState(null);
  const [editing, setEditing] = useState(null);
  const [deleteTarget, setDeleteTarget] = useState(null);
  const [deletingHistory, setDeletingHistory] = useState(false);

  // Creates the actual Expense/Income entry for a due template and advances
  // its next_due_date — repeated in a loop so a template nobody's touched in
  // a while catches up on every occurrence it missed, not just the latest.
  const generateOne = async (t) => {
    if (t.type === 'income') {
      await entities.Income.create({
        description: t.description,
        amount: t.amount,
        currency: t.currency || defaultCurrency,
        received_date: t.next_due_date,
        source: t.source || 'other',
        tags: ['recurring'],
        recurring_template_id: t.id,
      });
    } else {
      await entities.Expense.create({
        description: t.description,
        amount: t.amount,
        currency: t.currency || defaultCurrency,
        paid_date: t.next_due_date,
        category_id: t.category_id || null,
        payment_method: 'card',
        expense_type: 'single',
        amortization_schedule: [],
        tags: ['recurring'],
        recurring_template_id: t.id,
      });
    }
    const next = advanceDate(t.next_due_date, t.frequency, t.custom_interval_days);
    const next_due_date = format(next, 'yyyy-MM-dd');
    await entities.RecurringTemplate.update(t.id, { next_due_date });
    return next_due_date;
  };

  const catchUp = async (list) => {
    const today = format(new Date(), 'yyyy-MM-dd');
    let generated = 0;
    for (const t of list) {
      if (!t.active) continue;
      let dueDate = t.next_due_date;
      let iterations = 0;
      while (dueDate && dueDate <= today && iterations < 24) {
        dueDate = await generateOne({ ...t, next_due_date: dueDate });
        generated++;
        iterations++;
      }
    }
    return generated;
  };

  const load = () => {
    setLoading(true);
    setLoadError(null);
    (async () => {
      try {
        const list = await entities.RecurringTemplate.list();
        const generated = await catchUp(list);
        setTemplates(generated > 0 ? await entities.RecurringTemplate.list() : list);
        if (generated > 0) {
          toast({
            title: generated === 1 ? tr('recurring.entriesAddedOne', { count: generated }) : tr('recurring.entriesAddedOther', { count: generated }),
            description: tr('recurring.generatedAutomatically'),
          });
        }
      } catch (err) {
        setLoadError(err);
      } finally {
        setLoading(false);
      }
    })();
  };

  useEffect(() => {
    load();
    entities.Settings.list().then((sets) => {
      if (sets[0]?.default_currency) setDefaultCurrency(sets[0].default_currency);
    }).catch(() => {});
  }, []);

  const openNew = (type = 'expense') => setEditing({
    type, description: '', amount: '', currency: defaultCurrency, frequency: 'monthly', custom_interval_days: '',
    next_due_date: format(new Date(), 'yyyy-MM-dd'), active: true, source: 'salary', category_id: '',
  });
  const openEdit = (t) => setEditing({
    ...t,
    type: t.type || 'expense',
    currency: t.currency || defaultCurrency,
    amount: String(t.amount ?? ''),
    custom_interval_days: String(t.custom_interval_days ?? ''),
    source: t.source || 'salary',
    category_id: t.category_id || '',
  });

  const save = async (e) => {
    e.preventDefault();
    if (!editing.description.trim() || !editing.amount || !editing.next_due_date) return;
    const isIncome = editing.type === 'income';
    const payload = {
      type: editing.type,
      description: editing.description.trim(),
      amount: parseFloat(editing.amount),
      currency: editing.currency || defaultCurrency,
      frequency: editing.frequency,
      custom_interval_days: editing.frequency === 'custom_days' ? parseInt(editing.custom_interval_days) || 1 : null,
      next_due_date: editing.next_due_date,
      active: editing.active,
      source: isIncome ? (editing.source || 'other') : null,
      category_id: isIncome ? null : (editing.category_id || null),
    };
    try {
      const saved = editing.id
        ? await entities.RecurringTemplate.update(editing.id, payload)
        : await entities.RecurringTemplate.create(payload);
      setEditing(null);
      const generated = await catchUp([saved]);
      load();
      if (generated > 0) {
        toast({
          title: generated === 1 ? tr('recurring.entriesAddedOne', { count: generated }) : tr('recurring.entriesAddedOther', { count: generated }),
          description: tr('recurring.addedRightAway'),
        });
      }
    } catch (err) {
      toast({ title: tr('common.couldNotSave'), description: err.message, variant: 'destructive' });
    }
  };

  const toggleActive = async (t) => {
    await entities.RecurringTemplate.update(t.id, { active: !t.active });
    load();
  };

  const removeTemplateOnly = async () => {
    const t = deleteTarget;
    setDeleteTarget(null);
    await entities.RecurringTemplate.delete(t.id);
    load();
  };

  const removeTemplateAndHistory = async () => {
    const t = deleteTarget;
    setDeleteTarget(null);
    setDeletingHistory(true);
    try {
      const count = await deleteRecurringTemplateWithHistory(t);
      toast({
        title: count === 1
          ? tr('recurring.deletedWithHistoryOne', { count })
          : tr('recurring.deletedWithHistoryOther', { count }),
      });
      load();
    } catch (err) {
      toast({ title: tr('common.couldNotDelete'), description: err.message, variant: 'destructive' });
    } finally {
      setDeletingHistory(false);
    }
  };

  if (loading || subLoading || catQuery.isLoading) return <PageSkeleton />;
  if (loadError || catQuery.error) return <LoadError error={loadError || catQuery.error} onRetry={() => { load(); catQuery.refetch(); }} />;
  if (billingConfigured && !subActive) return <UpgradePrompt upgradeUrl={upgradeUrl} />;

  const forecast = forecastRecurring(templates, defaultCurrency, lang);
  const hasActive = templates.some((t) => t.active);

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between flex-wrap gap-3">
        <div>
          <h1 className="text-2xl font-heading font-semibold tracking-tight">{tr('recurring.title')}</h1>
          <p className="text-sm text-muted-foreground">{tr('recurring.subtitle')}</p>
        </div>
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Button><Plus className="w-4 h-4 mr-1" /> {tr('common.add')} <ChevronDown className="w-4 h-4 ml-1" /></Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end">
            <DropdownMenuItem onSelect={() => openNew('income')}>{tr('common.income')}</DropdownMenuItem>
            <DropdownMenuItem onSelect={() => openNew('expense')}>{tr('common.expense')}</DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
      </div>

      {templates.length === 0 && (
        <p className="text-sm text-muted-foreground">{tr('recurring.noneYet')}</p>
      )}

      {hasActive && (
        <Card className="p-5">
          <p className="text-sm font-medium mb-4">{tr('recurring.forecast')}</p>
          <div className="grid grid-cols-3 gap-4 mb-4">
            <div>
              <p className="text-xs text-muted-foreground">{tr('recurring.next30Days')}</p>
              <p className={`text-xl font-heading font-semibold tabular-nums ${forecast.next30 >= 0 ? 'text-emerald-600' : 'text-destructive'}`}>
                {forecast.next30 >= 0 ? '+' : ''}{fmt(forecast.next30, defaultCurrency)}
              </p>
            </div>
            <div>
              <p className="text-xs text-muted-foreground">{tr('recurring.monthlyAverage')}</p>
              <p className={`text-xl font-heading font-semibold tabular-nums ${forecast.monthlyAvg >= 0 ? 'text-emerald-600' : 'text-destructive'}`}>
                {forecast.monthlyAvg >= 0 ? '+' : ''}{fmt(forecast.monthlyAvg, defaultCurrency)}
              </p>
            </div>
            <div>
              <p className="text-xs text-muted-foreground">{tr('recurring.next12Months')}</p>
              <p className={`text-xl font-heading font-semibold tabular-nums ${forecast.next365 >= 0 ? 'text-emerald-600' : 'text-destructive'}`}>
                {forecast.next365 >= 0 ? '+' : ''}{fmt(forecast.next365, defaultCurrency)}
              </p>
            </div>
          </div>
          <div className="h-40">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={forecast.monthly} margin={{ top: 4, right: 8, bottom: 4, left: 8 }}>
                <XAxis dataKey="label" tick={{ fontSize: 11 }} tickLine={false} axisLine={false} />
                <YAxis tick={{ fontSize: 11 }} tickLine={false} axisLine={false} width={40} />
                <Tooltip
                  formatter={(v) => fmt(v, defaultCurrency)}
                  cursor={{ fill: 'hsl(var(--muted))' }}
                  contentStyle={{ borderRadius: 8, border: '1px solid hsl(var(--border))', fontSize: 12 }}
                />
                <Bar dataKey="total" radius={[4, 4, 4, 4]}>
                  {forecast.monthly.map((m, i) => (
                    <Cell key={i} fill={m.total >= 0 ? '#10b981' : '#ef4444'} />
                  ))}
                </Bar>
              </BarChart>
            </ResponsiveContainer>
          </div>
          {forecast.excludedCount > 0 && (
            <p className="text-xs text-muted-foreground mt-2">
              {tr('recurring.otherCurrenciesExcluded', { currency: defaultCurrency })}
            </p>
          )}
        </Card>
      )}

      <div className="space-y-2">
        {templates.map((t) => {
          const isIncome = t.type === 'income';
          const { pct, daysLeft } = cycleProgress(t);
          return (
            <Card key={t.id} className="p-4 space-y-3">
              <div className="flex items-center gap-3">
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2 flex-wrap">
                    <p className="font-medium truncate">{t.description}</p>
                    {isIncome && (
                      <span className="inline-flex items-center text-xs px-2 py-0.5 rounded-full bg-emerald-100 text-emerald-700">
                        {tr('recurring.incomeBadge')}
                      </span>
                    )}
                    {!t.active && <span className="text-xs text-muted-foreground">{tr('recurring.paused')}</span>}
                  </div>
                  <p className="text-xs text-muted-foreground mt-0.5">
                    {FREQUENCIES.find((f) => f.value === t.frequency)?.label}
                    {t.frequency === 'custom_days' && ` · ${tr('recurring.everyNDays', { n: t.custom_interval_days })}`}
                    {` · ${tr('recurring.next', { date: t.next_due_date })}`}
                  </p>
                </div>
                <div className="text-right">
                  <p className={`font-semibold tabular-nums ${isIncome ? 'text-emerald-600' : ''}`}>
                    {isIncome ? '+' : ''}{fmt(t.amount, t.currency)}
                  </p>
                  <p className="text-[11px] text-muted-foreground tabular-nums">
                    {fmt(annualAmount(t), t.currency)}{tr('recurring.perYear')}
                  </p>
                </div>
                <Button
                  variant="ghost" size="icon" onClick={() => toggleActive(t)}
                  aria-label={t.active ? tr('recurring.pauseTemplateButton', { description: t.description }) : tr('recurring.resumeTemplateButton', { description: t.description })}
                >
                  <Pause className="w-4 h-4" />
                </Button>
                <Button variant="ghost" size="icon" onClick={() => openEdit(t)} aria-label={tr('recurring.editTemplateButton', { description: t.description })}>
                  <Pencil className="w-4 h-4" />
                </Button>
                <Button variant="ghost" size="icon" onClick={() => setDeleteTarget(t)} aria-label={tr('recurring.deleteTemplateButton', { description: t.description })}>
                  <Trash2 className="w-4 h-4" />
                </Button>
              </div>
              {t.active && (
                <div>
                  <div className="h-1.5 rounded-full bg-muted overflow-hidden">
                    <div
                      className="h-full rounded-full"
                      style={{ width: `${pct}%`, background: isIncome ? '#10b981' : '#0f172a' }}
                    />
                  </div>
                  <p className="text-[11px] text-muted-foreground mt-1">
                    {daysLeft === 0
                      ? tr('recurring.dueToday')
                      : isIncome
                        ? (daysLeft === 1 ? tr('recurring.expectedInDayOne', { n: daysLeft }) : tr('recurring.expectedInDayOther', { n: daysLeft }))
                        : (daysLeft === 1 ? tr('recurring.renewsInDayOne', { n: daysLeft }) : tr('recurring.renewsInDayOther', { n: daysLeft }))}
                  </p>
                </div>
              )}
            </Card>
          );
        })}
      </div>

      {editing && (
        <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center bg-black/40 p-4" onClick={() => setEditing(null)}>
          <Card className="p-5 w-full max-w-md space-y-4" onClick={(e) => e.stopPropagation()}>
            <div className="flex items-center justify-between">
              <h2 className="font-heading font-semibold">{editing.id ? tr('recurring.editTemplate') : tr('recurring.newTemplate')}</h2>
              <Button variant="ghost" size="icon" onClick={() => setEditing(null)} aria-label={tr('common.close')}><X className="w-4 h-4" /></Button>
            </div>
            <form onSubmit={save} className="space-y-4">
              <div className="space-y-2">
                <Label>{tr('recurring.type')}</Label>
                <Select value={editing.type} onValueChange={(v) => setEditing({ ...editing, type: v })}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    {TYPES.map((ty) => (
                      <SelectItem key={ty.value} value={ty.value}>{ty.label}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-2">
                <Label htmlFor="r-desc">{tr('common.description')}</Label>
                <Input id="r-desc" value={editing.description} onChange={(e) => setEditing({ ...editing, description: e.target.value })} autoFocus />
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div className="space-y-2">
                  <Label htmlFor="r-amount">{tr('common.amount')}</Label>
                  <Input id="r-amount" type="number" step="0.01" value={editing.amount} onChange={(e) => setEditing({ ...editing, amount: e.target.value })} />
                </div>
                <div className="space-y-2">
                  <Label>{tr('common.currency')}</Label>
                  <Select value={editing.currency || defaultCurrency} onValueChange={(v) => setEditing({ ...editing, currency: v })}>
                    <SelectTrigger><SelectValue /></SelectTrigger>
                    <SelectContent>
                      {CURRENCIES.map((c) => (
                        <SelectItem key={c} value={c}>{c}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
              </div>
              {editing.type === 'income' ? (
                <div className="space-y-2">
                  <Label>{tr('incomeForm.source')}</Label>
                  <Select value={editing.source} onValueChange={(v) => setEditing({ ...editing, source: v })}>
                    <SelectTrigger><SelectValue /></SelectTrigger>
                    <SelectContent>
                      {incomeSources.map((s) => (
                        <SelectItem key={s.value} value={s.value}>{s.label}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
              ) : (
                <div className="space-y-2">
                  <Label>{tr('common.category')}</Label>
                  {/* Every occurrence this template generates carries this
                      category — set once here instead of having to
                      re-categorize each month's auto-added expense by hand. */}
                  <Select value={editing.category_id} onValueChange={(v) => setEditing({ ...editing, category_id: v })}>
                    <SelectTrigger><SelectValue placeholder={tr('expenseForm.categoryPlaceholder')} /></SelectTrigger>
                    <SelectContent>
                      {flattenCategoryTree(categories).map((c) => (
                        <SelectItem key={c.id} value={c.id} className={c.depth > 0 ? 'pl-6 text-muted-foreground' : ''}>
                          {c.depth > 0 ? '↳ ' : ''}{c.name}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
              )}
              <div className="grid grid-cols-2 gap-3">
                <div className="space-y-2">
                  <Label htmlFor="r-due">{tr('recurring.nextDue')}</Label>
                  <Input id="r-due" type="date" value={editing.next_due_date} onChange={(e) => setEditing({ ...editing, next_due_date: e.target.value })} />
                </div>
                <div className="space-y-2">
                  <Label>{tr('recurring.frequencyLabel')}</Label>
                  <Select value={editing.frequency} onValueChange={(v) => setEditing({ ...editing, frequency: v })}>
                    <SelectTrigger><SelectValue /></SelectTrigger>
                    <SelectContent>
                      {FREQUENCIES.map((f) => (
                        <SelectItem key={f.value} value={f.value}>{f.label}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
                {editing.frequency === 'custom_days' && (
                  <div className="space-y-2">
                    <Label htmlFor="r-custom">{tr('recurring.everyDays')}</Label>
                    <Input id="r-custom" type="number" value={editing.custom_interval_days} onChange={(e) => setEditing({ ...editing, custom_interval_days: e.target.value })} />
                  </div>
                )}
              </div>
              <div className="flex items-center justify-between">
                <Label htmlFor="r-active">{tr('recurring.active')}</Label>
                <Switch checked={editing.active} onCheckedChange={(v) => setEditing({ ...editing, active: v })} />
              </div>
              <Button type="submit" className="w-full">{tr('common.save')}</Button>
            </form>
          </Card>
        </div>
      )}

      <AlertDialog open={!!deleteTarget} onOpenChange={(open) => { if (!open) setDeleteTarget(null); }}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>{tr('recurring.deleteConfirmTitle', { description: deleteTarget?.description })}</AlertDialogTitle>
            <AlertDialogDescription>{tr('recurring.deleteConfirmBody')}</AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter className="flex-col sm:flex-col gap-2">
            <button
              type="button"
              onClick={removeTemplateAndHistory}
              disabled={deletingHistory}
              className={buttonVariants({ variant: 'destructive', className: 'w-full' })}
            >
              {tr('recurring.deleteTemplateAndHistory')}
            </button>
            <button
              type="button"
              onClick={removeTemplateOnly}
              className={buttonVariants({ variant: 'outline', className: 'w-full' })}
            >
              {tr('recurring.deleteTemplateOnly')}
            </button>
            <AlertDialogCancel className="w-full mt-0">{tr('common.cancel')}</AlertDialogCancel>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
