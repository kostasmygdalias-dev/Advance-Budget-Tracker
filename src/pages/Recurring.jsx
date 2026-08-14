import { useEffect, useState } from 'react';
import { entities } from '@/lib/sheetsStore';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Card } from '@/components/ui/card';
import { Switch } from '@/components/ui/switch';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { useToast } from '@/components/ui/use-toast';
import { Plus, Pencil, Trash2, X, Zap, Pause } from 'lucide-react';
import { addDays, addMonths, addWeeks, format } from 'date-fns';
import { INCOME_SOURCES } from '@/components/IncomeForm';
import LoadError from '@/components/LoadError';
import PageSkeleton from '@/components/PageSkeleton';

const FREQUENCIES = [
  { value: 'daily', label: 'Daily' },
  { value: 'weekly', label: 'Weekly' },
  { value: 'monthly', label: 'Monthly' },
  { value: 'custom_days', label: 'Custom (days)' },
];

const TYPES = [
  { value: 'expense', label: 'Expense' },
  { value: 'income', label: 'Income' },
];

const CURRENCIES = ['EUR', 'USD', 'GBP', 'CHF', 'JPY', 'AUD', 'CAD'];

const fmt = (n, c = 'EUR') => `${(n || 0).toFixed(2)} ${c}`;

function advanceDate(dateStr, frequency, customDays) {
  // Parse as local calendar components, not `new Date(dateStr)` (UTC midnight),
  // which can roll a month-start date back a day for timezones west of UTC.
  const [y, m, day] = dateStr.split('-').map(Number);
  const d = new Date(y, m - 1, day);
  if (frequency === 'daily') return addDays(d, 1);
  if (frequency === 'weekly') return addWeeks(d, 1);
  if (frequency === 'monthly') return addMonths(d, 1);
  return addDays(d, customDays || 1);
}

export default function Recurring() {
  const { toast } = useToast();
  const [templates, setTemplates] = useState([]);
  const [defaultCurrency, setDefaultCurrency] = useState('EUR');
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState(null);
  const [editing, setEditing] = useState(null);

  const load = () => {
    setLoading(true);
    setLoadError(null);
    entities.RecurringTemplate.list().then(setTemplates).catch(setLoadError).finally(() => setLoading(false));
  };

  useEffect(() => {
    load();
    entities.Settings.list().then((sets) => {
      if (sets[0]?.default_currency) setDefaultCurrency(sets[0].default_currency);
    }).catch(() => {});
  }, []);

  const openNew = () => setEditing({
    type: 'expense', description: '', amount: '', currency: defaultCurrency, frequency: 'monthly', custom_interval_days: '',
    next_due_date: format(new Date(), 'yyyy-MM-dd'), active: true, source: 'salary',
  });
  const openEdit = (t) => setEditing({
    ...t,
    type: t.type || 'expense',
    currency: t.currency || defaultCurrency,
    amount: String(t.amount ?? ''),
    custom_interval_days: String(t.custom_interval_days ?? ''),
    source: t.source || 'salary',
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
    };
    try {
      if (editing.id) {
        await entities.RecurringTemplate.update(editing.id, payload);
      } else {
        await entities.RecurringTemplate.create(payload);
      }
      setEditing(null);
      load();
    } catch (err) {
      toast({ title: 'Could not save', description: err.message, variant: 'destructive' });
    }
  };

  const toggleActive = async (t) => {
    await entities.RecurringTemplate.update(t.id, { active: !t.active });
    load();
  };

  const remove = async (t) => {
    await entities.RecurringTemplate.delete(t.id);
    load();
  };

  const generateNext = async (t) => {
    try {
      if (t.type === 'income') {
        await entities.Income.create({
          description: t.description,
          amount: t.amount,
          currency: t.currency || defaultCurrency,
          received_date: t.next_due_date,
          source: t.source || 'other',
          tags: ['recurring'],
        });
      } else {
        await entities.Expense.create({
          description: t.description,
          amount: t.amount,
          currency: t.currency || defaultCurrency,
          paid_date: t.next_due_date,
          payment_method: 'card',
          expense_type: 'single',
          amortization_schedule: [],
          tags: ['recurring'],
        });
      }
      const next = advanceDate(t.next_due_date, t.frequency, t.custom_interval_days);
      await entities.RecurringTemplate.update(t.id, { next_due_date: format(next, 'yyyy-MM-dd') });
      toast({ title: 'Entry generated', description: `Next due: ${format(next, 'yyyy-MM-dd')}` });
      load();
    } catch (err) {
      toast({ title: 'Could not generate', description: err.message, variant: 'destructive' });
    }
  };

  if (loading) return <PageSkeleton />;
  if (loadError) return <LoadError error={loadError} onRetry={load} />;

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-heading font-semibold tracking-tight">Recurring</h1>
          <p className="text-sm text-muted-foreground">Templates for expenses and income that repeat indefinitely.</p>
        </div>
        <Button onClick={openNew}><Plus className="w-4 h-4 mr-1" /> New</Button>
      </div>

      {templates.length === 0 && (
        <p className="text-sm text-muted-foreground">No recurring templates yet.</p>
      )}

      <div className="space-y-2">
        {templates.map((t) => {
          const isIncome = t.type === 'income';
          return (
            <Card key={t.id} className="p-4 flex items-center gap-3">
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2 flex-wrap">
                  <p className="font-medium truncate">{t.description}</p>
                  {isIncome && (
                    <span className="inline-flex items-center text-xs px-2 py-0.5 rounded-full bg-emerald-100 text-emerald-700">
                      Income
                    </span>
                  )}
                  {!t.active && <span className="text-xs text-muted-foreground">(paused)</span>}
                </div>
                <p className="text-xs text-muted-foreground mt-0.5">
                  {FREQUENCIES.find((f) => f.value === t.frequency)?.label}
                  {t.frequency === 'custom_days' && ` · every ${t.custom_interval_days}d`}
                  {` · next ${t.next_due_date}`}
                </p>
              </div>
              <span className={`font-semibold tabular-nums ${isIncome ? 'text-emerald-600' : ''}`}>
                {isIncome ? '+' : ''}{fmt(t.amount, t.currency)}
              </span>
              <Button variant="outline" size="sm" onClick={() => generateNext(t)} disabled={!t.active}>
                <Zap className="w-3.5 h-3.5 mr-1" /> Generate
              </Button>
              <Button variant="ghost" size="icon" onClick={() => toggleActive(t)}><Pause className="w-4 h-4" /></Button>
              <Button variant="ghost" size="icon" onClick={() => openEdit(t)}><Pencil className="w-4 h-4" /></Button>
              <Button variant="ghost" size="icon" onClick={() => remove(t)}><Trash2 className="w-4 h-4" /></Button>
            </Card>
          );
        })}
      </div>

      {editing && (
        <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center bg-black/40 p-4" onClick={() => setEditing(null)}>
          <Card className="p-5 w-full max-w-md space-y-4" onClick={(e) => e.stopPropagation()}>
            <div className="flex items-center justify-between">
              <h2 className="font-heading font-semibold">{editing.id ? 'Edit template' : 'New recurring template'}</h2>
              <Button variant="ghost" size="icon" onClick={() => setEditing(null)}><X className="w-4 h-4" /></Button>
            </div>
            <form onSubmit={save} className="space-y-4">
              <div className="space-y-2">
                <Label>Type</Label>
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
                <Label htmlFor="r-desc">Description</Label>
                <Input id="r-desc" value={editing.description} onChange={(e) => setEditing({ ...editing, description: e.target.value })} autoFocus />
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div className="space-y-2">
                  <Label htmlFor="r-amount">Amount</Label>
                  <Input id="r-amount" type="number" step="0.01" value={editing.amount} onChange={(e) => setEditing({ ...editing, amount: e.target.value })} />
                </div>
                <div className="space-y-2">
                  <Label>Currency</Label>
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
              {editing.type === 'income' && (
                <div className="space-y-2">
                  <Label>Source</Label>
                  <Select value={editing.source} onValueChange={(v) => setEditing({ ...editing, source: v })}>
                    <SelectTrigger><SelectValue /></SelectTrigger>
                    <SelectContent>
                      {INCOME_SOURCES.map((s) => (
                        <SelectItem key={s.value} value={s.value}>{s.label}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
              )}
              <div className="grid grid-cols-2 gap-3">
                <div className="space-y-2">
                  <Label htmlFor="r-due">Next due</Label>
                  <Input id="r-due" type="date" value={editing.next_due_date} onChange={(e) => setEditing({ ...editing, next_due_date: e.target.value })} />
                </div>
                <div className="space-y-2">
                  <Label>Frequency</Label>
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
                    <Label htmlFor="r-custom">Every (days)</Label>
                    <Input id="r-custom" type="number" value={editing.custom_interval_days} onChange={(e) => setEditing({ ...editing, custom_interval_days: e.target.value })} />
                  </div>
                )}
              </div>
              <div className="flex items-center justify-between">
                <Label htmlFor="r-active">Active</Label>
                <Switch checked={editing.active} onCheckedChange={(v) => setEditing({ ...editing, active: v })} />
              </div>
              <Button type="submit" className="w-full">Save</Button>
            </form>
          </Card>
        </div>
      )}
    </div>
  );
}
