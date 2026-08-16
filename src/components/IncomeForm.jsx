import { useState, useEffect } from 'react';
import { Wallet, Laptop, Briefcase, TrendingUp, Gift, RotateCcw, CircleDollarSign } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { useToast } from '@/components/ui/use-toast';
import { entities } from '@/lib/sheetsStore';
import { useLanguage } from '@/lib/i18n';

// A function, not a static array, so every call site can translate the
// labels with its own t() — the underlying values (stored in the
// spreadsheet) never change with language.
export const getIncomeSources = (t) => [
  { value: 'salary', label: t('common.incomeSource.salary') },
  { value: 'freelance', label: t('common.incomeSource.freelance') },
  { value: 'business', label: t('common.incomeSource.business') },
  { value: 'investment', label: t('common.incomeSource.investment') },
  { value: 'gift', label: t('common.incomeSource.gift') },
  { value: 'refund', label: t('common.incomeSource.refund') },
  { value: 'other', label: t('common.incomeSource.other') },
];

export const INCOME_SOURCE_ICONS = {
  salary: Wallet,
  freelance: Laptop,
  business: Briefcase,
  investment: TrendingUp,
  gift: Gift,
  refund: RotateCcw,
  other: CircleDollarSign,
};
const CURRENCIES = ['EUR', 'USD', 'GBP', 'CHF', 'JPY', 'AUD', 'CAD'];

const pad2 = (n) => String(n).padStart(2, '0');
// Local date, not UTC — toISOString() would show yesterday's/tomorrow's date
// for users behind/ahead of UTC around midnight.
const todayStr = () => {
  const d = new Date();
  return `${d.getFullYear()}-${pad2(d.getMonth() + 1)}-${pad2(d.getDate())}`;
};

export default function IncomeForm({ initialIncome, onSaved, onCancel }) {
  const { toast } = useToast();
  const { t } = useLanguage();
  const incomeSources = getIncomeSources(t);
  const [saving, setSaving] = useState(false);
  const [form, setForm] = useState({
    description: '',
    amount: '',
    currency: 'EUR',
    received_date: todayStr(),
    source: 'salary',
    notes: '',
    tags: '',
  });

  useEffect(() => {
    if (initialIncome) {
      setForm({
        description: initialIncome.description || '',
        amount: initialIncome.amount ?? '',
        currency: initialIncome.currency || 'EUR',
        received_date: initialIncome.received_date || todayStr(),
        source: initialIncome.source || 'salary',
        notes: initialIncome.notes || '',
        tags: (initialIncome.tags || []).join(', '),
      });
    }
  }, [initialIncome]);

  const set = (k, v) => setForm((f) => ({ ...f, [k]: v }));

  const amountNum = parseFloat(form.amount);
  const canSave = form.description.trim() && amountNum > 0 && form.received_date;

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (!canSave || saving) return;
    setSaving(true);
    try {
      const tags = form.tags.split(',').map((t) => t.trim()).filter(Boolean);
      const payload = {
        description: form.description.trim(),
        amount: amountNum,
        currency: form.currency,
        received_date: form.received_date,
        source: form.source,
        notes: form.notes || null,
        tags,
      };
      if (initialIncome?.id) {
        await entities.Income.update(initialIncome.id, payload);
      } else {
        await entities.Income.create(payload);
      }
      toast({ title: initialIncome ? t('incomeForm.incomeUpdated') : t('incomeForm.incomeAdded') });
      onSaved?.();
    } catch (err) {
      toast({ title: t('common.couldNotSave'), description: err.message, variant: 'destructive' });
    } finally {
      setSaving(false);
    }
  };

  return (
    <form onSubmit={handleSubmit} className="space-y-5 max-w-2xl">
      <div className="space-y-2">
        <Label htmlFor="description">{t('common.description')}</Label>
        <Input
          id="description"
          value={form.description}
          onChange={(e) => set('description', e.target.value)}
          placeholder={t('incomeForm.descriptionPlaceholder')}
        />
      </div>

      <div className="grid grid-cols-2 sm:grid-cols-3 gap-4">
        <div className="space-y-2 col-span-2 sm:col-span-1">
          <Label htmlFor="amount">{t('common.amount')}</Label>
          <Input
            id="amount"
            type="number"
            step="0.01"
            min="0"
            value={form.amount}
            onChange={(e) => set('amount', e.target.value)}
            placeholder="0.00"
          />
        </div>
        <div className="space-y-2">
          <Label>{t('common.currency')}</Label>
          <Select value={form.currency} onValueChange={(v) => set('currency', v)}>
            <SelectTrigger><SelectValue /></SelectTrigger>
            <SelectContent>
              {CURRENCIES.map((c) => (
                <SelectItem key={c} value={c}>{c}</SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
        <div className="space-y-2">
          <Label htmlFor="received_date">{t('incomeForm.receivedDate')}</Label>
          <Input
            id="received_date"
            type="date"
            value={form.received_date}
            onChange={(e) => set('received_date', e.target.value)}
          />
        </div>
      </div>

      <div className="space-y-2">
        <Label>{t('incomeForm.source')}</Label>
        <Select value={form.source} onValueChange={(v) => set('source', v)}>
          <SelectTrigger><SelectValue /></SelectTrigger>
          <SelectContent>
            {incomeSources.map((s) => (
              <SelectItem key={s.value} value={s.value}>{s.label}</SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>

      <div className="space-y-2">
        <Label htmlFor="tags">{t('common.tags')}</Label>
        <Input
          id="tags"
          value={form.tags}
          onChange={(e) => set('tags', e.target.value)}
          placeholder={t('common.tagsPlaceholder')}
        />
      </div>

      <div className="space-y-2">
        <Label htmlFor="notes">{t('common.notes')}</Label>
        <Textarea
          id="notes"
          value={form.notes}
          onChange={(e) => set('notes', e.target.value)}
          rows={2}
          placeholder={t('common.optionalNotes')}
        />
      </div>

      <div className="flex gap-3 pt-1">
        <Button type="submit" disabled={!canSave || saving}>
          {saving ? t('common.saving') : initialIncome ? t('incomeForm.saveChanges') : t('incomeForm.addIncome')}
        </Button>
        {onCancel && (
          <Button type="button" variant="ghost" onClick={onCancel}>{t('common.cancel')}</Button>
        )}
      </div>
    </form>
  );
}
