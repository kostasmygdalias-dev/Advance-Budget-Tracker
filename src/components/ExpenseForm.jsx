import { useState, useEffect } from 'react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Switch } from '@/components/ui/switch';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { useToast } from '@/components/ui/use-toast';
import { calculateAmortizationSchedule } from '@/lib/finance';
import { entities, uploadReceipt } from '@/lib/sheetsStore';
import { useLanguage } from '@/lib/i18n';
import AmortizationPreview from './AmortizationPreview';

const getPaymentMethods = (t) => [
  { value: 'cash', label: t('common.paymentMethod.cash') },
  { value: 'card', label: t('common.paymentMethod.card') },
  { value: 'bank_transfer', label: t('common.paymentMethod.bank_transfer') },
  { value: 'other', label: t('common.paymentMethod.other') },
];
const CURRENCIES = ['EUR', 'USD', 'GBP', 'CHF', 'JPY', 'AUD', 'CAD'];
const getUnits = (t) => [
  { value: 'day', label: t('expenseForm.units.day') },
  { value: 'week', label: t('expenseForm.units.week') },
  { value: 'month', label: t('expenseForm.units.month') },
  { value: 'year', label: t('expenseForm.units.year') },
];

const pad2 = (n) => String(n).padStart(2, '0');
// Local date, not UTC — toISOString() would show yesterday's/tomorrow's date
// for users behind/ahead of UTC around midnight.
const todayStr = () => {
  const d = new Date();
  return `${d.getFullYear()}-${pad2(d.getMonth() + 1)}-${pad2(d.getDate())}`;
};

export default function ExpenseForm({ initialExpense, onSaved, onCancel }) {
  const { toast } = useToast();
  const { t } = useLanguage();
  const PAYMENT_METHODS = getPaymentMethods(t);
  const UNITS = getUnits(t);
  const [categories, setCategories] = useState([]);
  const [saving, setSaving] = useState(false);
  const [receiptFile, setReceiptFile] = useState(null);
  const [form, setForm] = useState({
    description: '',
    amount: '',
    currency: 'EUR',
    paid_date: todayStr(),
    category_id: '',
    payment_method: 'card',
    notes: '',
    tags: '',
    expense_type: 'single',
    period_value: '',
    period_unit: 'month',
  });

  useEffect(() => {
    entities.Category.list().then(setCategories).catch(() => {});
  }, []);

  useEffect(() => {
    if (initialExpense) {
      setForm({
        description: initialExpense.description || '',
        amount: initialExpense.amount ?? '',
        currency: initialExpense.currency || 'EUR',
        paid_date: initialExpense.paid_date || todayStr(),
        category_id: initialExpense.category_id || '',
        payment_method: initialExpense.payment_method || 'card',
        notes: initialExpense.notes || '',
        tags: (initialExpense.tags || []).join(', '),
        expense_type: initialExpense.expense_type || 'single',
        period_value: initialExpense.period_value ?? '',
        period_unit: initialExpense.period_unit || 'month',
      });
    }
  }, [initialExpense]);

  const set = (k, v) => setForm((f) => ({ ...f, [k]: v }));

  const isAmortized = form.expense_type === 'amortized';
  const periodValueNum = parseFloat(form.period_value);
  const amountNum = parseFloat(form.amount);
  const canSave =
    form.description.trim() &&
    amountNum > 0 &&
    form.paid_date &&
    (!isAmortized || (periodValueNum > 0 && form.period_unit));

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (!canSave || saving) return;
    setSaving(true);
    try {
      let receipt_url = initialExpense?.receipt_file_url || '';
      if (receiptFile) {
        receipt_url = await uploadReceipt(receiptFile);
      }
      const tags = form.tags.split(',').map((t) => t.trim()).filter(Boolean);
      const payload = {
        description: form.description.trim(),
        amount: amountNum,
        currency: form.currency,
        paid_date: form.paid_date,
        category_id: form.category_id || null,
        payment_method: form.payment_method,
        notes: form.notes || null,
        tags,
        receipt_file_url: receipt_url || null,
        expense_type: form.expense_type,
        period_value: isAmortized ? periodValueNum : null,
        period_unit: isAmortized ? form.period_unit : null,
        amortization_schedule: isAmortized
          ? calculateAmortizationSchedule(form.paid_date, periodValueNum, form.period_unit, amountNum)
          : [],
      };
      if (initialExpense?.id) {
        await entities.Expense.update(initialExpense.id, payload);
      } else {
        await entities.Expense.create(payload);
      }
      toast({ title: initialExpense ? t('expenseForm.expenseUpdated') : t('expenseForm.expenseAdded') });
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
          placeholder={t('expenseForm.descriptionPlaceholder')}
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
          <Label htmlFor="paid_date">{t('expenseForm.paidDate')}</Label>
          <Input
            id="paid_date"
            type="date"
            value={form.paid_date}
            onChange={(e) => set('paid_date', e.target.value)}
          />
        </div>
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
        <div className="space-y-2">
          <Label>{t('common.category')}</Label>
          <Select value={form.category_id} onValueChange={(v) => set('category_id', v)}>
            <SelectTrigger><SelectValue placeholder={t('expenseForm.categoryPlaceholder')} /></SelectTrigger>
            <SelectContent>
              {categories.map((c) => (
                <SelectItem key={c.id} value={c.id}>{c.name}</SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
        <div className="space-y-2">
          <Label>{t('expenseForm.paymentMethod')}</Label>
          <Select value={form.payment_method} onValueChange={(v) => set('payment_method', v)}>
            <SelectTrigger><SelectValue /></SelectTrigger>
            <SelectContent>
              {PAYMENT_METHODS.map((m) => (
                <SelectItem key={m.value} value={m.value}>{m.label}</SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
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

      <div className="space-y-2">
        <Label htmlFor="receipt">{t('expenseForm.receiptOptional')}</Label>
        <Input
          id="receipt"
          type="file"
          accept="image/*,application/pdf"
          onChange={(e) => setReceiptFile(e.target.files?.[0] || null)}
        />
      </div>

      <div className="rounded-xl border p-4 space-y-3">
        <div className="flex items-center justify-between">
          <div>
            <p className="text-sm font-medium">{t('expenseForm.amortizedTitle')}</p>
            <p className="text-xs text-muted-foreground">{t('expenseForm.amortizedSubtitle')}</p>
          </div>
          <Switch
            checked={isAmortized}
            onCheckedChange={(v) => set('expense_type', v ? 'amortized' : 'single')}
          />
        </div>

        {isAmortized && (
          <div className="space-y-4">
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label htmlFor="period_value">{t('expenseForm.periodValue')}</Label>
                <Input
                  id="period_value"
                  type="number"
                  step="0.01"
                  min="0"
                  value={form.period_value}
                  onChange={(e) => set('period_value', e.target.value)}
                  placeholder={t('expenseForm.periodValuePlaceholder')}
                />
              </div>
              <div className="space-y-2">
                <Label>{t('expenseForm.periodUnit')}</Label>
                <Select value={form.period_unit} onValueChange={(v) => set('period_unit', v)}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    {UNITS.map((u) => (
                      <SelectItem key={u.value} value={u.value}>{u.label}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            </div>
            {periodValueNum > 0 && amountNum > 0 && (
              <AmortizationPreview
                amount={amountNum}
                periodValue={periodValueNum}
                periodUnit={form.period_unit}
                paidDate={form.paid_date}
                currency={form.currency}
              />
            )}
          </div>
        )}
      </div>

      <div className="flex gap-3 pt-1">
        <Button type="submit" disabled={!canSave || saving}>
          {saving ? t('common.saving') : initialExpense ? t('expenseForm.saveChanges') : t('expenseForm.addExpense')}
        </Button>
        {onCancel && (
          <Button type="button" variant="ghost" onClick={onCancel}>{t('common.cancel')}</Button>
        )}
      </div>
    </form>
  );
}