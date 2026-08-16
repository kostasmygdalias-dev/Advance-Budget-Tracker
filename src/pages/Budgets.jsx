import { useEffect, useState } from 'react';
import { startOfWeek, endOfWeek } from 'date-fns';
import { entities } from '@/lib/sheetsStore';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Card } from '@/components/ui/card';
import { useToast } from '@/components/ui/use-toast';
import { Save } from 'lucide-react';
import { getMonthlyContribution, currentMonthStr } from '@/lib/finance';
import { CategoryIcon, IconAvatar } from '@/lib/categoryIcons';
import LoadError from '@/components/LoadError';
import PageSkeleton from '@/components/PageSkeleton';
import { useLanguage } from '@/lib/i18n';

const fmt = (n, c = 'EUR') => `${(n || 0).toFixed(2)} ${c}`;

function parseLocalDateDash(dateStr) {
  const [y, m, d] = dateStr.split('-').map(Number);
  return new Date(y, m - 1, d);
}

function ProgressBar({ pct }) {
  return (
    <div className="h-1.5 rounded-full bg-muted overflow-hidden">
      <div
        className="h-full rounded-full transition-all"
        style={{ width: `${Math.min(100, pct)}%`, background: pct >= 100 ? '#ef4444' : '#0f172a' }}
      />
    </div>
  );
}

function BudgetRow({ category, spent, currency, value, onChange, indent }) {
  const { t } = useLanguage();
  const amount = value === '' || value == null ? null : Number(value);
  const pct = amount > 0 ? (spent / amount) * 100 : 0;
  return (
    <div className={`space-y-2 ${indent ? 'ml-8' : ''}`}>
      <div className="flex items-center gap-3">
        <IconAvatar icon={(props) => <CategoryIcon name={category.icon} {...props} />} color={category.color} className="w-8 h-8" />
        <Label className="flex-1 min-w-0 truncate">{category.name}</Label>
        <Input
          type="number"
          step="0.01"
          value={value ?? ''}
          onChange={(e) => onChange(e.target.value)}
          placeholder={t('budgets.noBudget')}
          className="w-32"
        />
      </div>
      {amount > 0 && (
        <div className="ml-11">
          <ProgressBar pct={pct} />
          <p className="text-xs text-muted-foreground mt-1">
            {fmt(spent, currency)} / {fmt(amount, currency)} · {t('budgets.thisMonth', { pct: pct.toFixed(0) })}
          </p>
        </div>
      )}
    </div>
  );
}

export default function Budgets() {
  const { toast } = useToast();
  const { t } = useLanguage();
  const [settings, setSettings] = useState(null);
  const [categories, setCategories] = useState([]);
  const [expenses, setExpenses] = useState([]);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState(null);
  const [saving, setSaving] = useState(false);
  const [totalBudget, setTotalBudget] = useState('');
  const [perCategory, setPerCategory] = useState({});

  const load = () => {
    setLoading(true);
    setLoadError(null);
    (async () => {
      try {
        const [sets, cats, exp] = await Promise.all([
          entities.Settings.list(),
          entities.Category.list(),
          entities.Expense.list('-paid_date', 500),
        ]);
        setSettings(sets[0] || null);
        setCategories(cats);
        setExpenses(exp);
      } catch (err) {
        setLoadError(err);
      } finally {
        setLoading(false);
      }
    })();
  };

  useEffect(load, []);

  useEffect(() => {
    if (settings) {
      setTotalBudget(settings.monthly_budget_total ?? '');
      setPerCategory(settings.budget_per_category || {});
    }
  }, [settings]);

  const save = async () => {
    setSaving(true);
    try {
      const updated = await entities.Settings.update(settings.id, {
        monthly_budget_total: totalBudget === '' ? null : parseFloat(totalBudget),
        budget_per_category: perCategory,
      });
      setSettings(updated);
      toast({ title: t('budgets.saved') });
    } catch (err) {
      toast({ title: t('common.couldNotSave'), description: err.message, variant: 'destructive' });
    } finally {
      setSaving(false);
    }
  };

  const updateCatBudget = (catId, v) => setPerCategory((p) => ({ ...p, [catId]: v === '' ? null : parseFloat(v) }));

  if (loading) return <PageSkeleton rows={3} />;
  if (loadError) return <LoadError error={loadError} onRetry={load} />;

  const currency = settings?.default_currency || 'EUR';
  const budgetPeriod = settings?.budget_period || 'monthly';
  const thisMonth = currentMonthStr();

  // Same period logic as the Dashboard budget widget, so the "Overall
  // budget" figure here always matches what that widget shows.
  const now = new Date();
  const periodStart = budgetPeriod === 'weekly' ? startOfWeek(now, { weekStartsOn: 1 }) : new Date(now.getFullYear(), now.getMonth(), 1);
  const periodEnd = budgetPeriod === 'weekly'
    ? endOfWeek(now, { weekStartsOn: 1 })
    : new Date(now.getFullYear(), now.getMonth() + 1, 0, 23, 59, 59, 999);

  const totalSpentPeriod = budgetPeriod === 'weekly'
    ? expenses.reduce((s, e) => {
        if ((e.currency || 'EUR') !== currency || e.expense_type === 'amortized' || !e.paid_date) return s;
        const d = parseLocalDateDash(e.paid_date);
        return d >= periodStart && d <= periodEnd ? s + (e.amount || 0) : s;
      }, 0)
    : expenses.reduce((s, e) => s + ((e.currency || 'EUR') === currency ? getMonthlyContribution(e, thisMonth) : 0), 0);

  // Per-category progress is always monthly — doubling every category row
  // with its own weekly/monthly toggle would be a lot of UI for little gain.
  const spentByCategory = {};
  expenses.forEach((e) => {
    if ((e.currency || 'EUR') !== currency) return;
    const contrib = getMonthlyContribution(e, thisMonth);
    if (contrib <= 0) return;
    const key = e.category_id || 'uncategorized';
    spentByCategory[key] = (spentByCategory[key] || 0) + contrib;
  });

  const byOrder = (a, b) => (a.sort_order ?? 0) - (b.sort_order ?? 0);
  const topLevel = categories.filter((c) => !c.parent_id).sort(byOrder);
  const childrenOf = (id) => categories.filter((c) => c.parent_id === id).sort(byOrder);

  const totalAmount = totalBudget === '' ? null : Number(totalBudget);
  const totalPct = totalAmount > 0 ? (totalSpentPeriod / totalAmount) * 100 : 0;

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between flex-wrap gap-3">
        <div>
          <h1 className="text-2xl font-heading font-semibold tracking-tight">{t('budgets.title')}</h1>
          <p className="text-sm text-muted-foreground">{t('budgets.subtitle')}</p>
        </div>
        <Button onClick={save} disabled={saving}>
          <Save className="w-4 h-4 mr-1" /> {saving ? t('common.saving') : t('budgets.saveBudgets')}
        </Button>
      </div>

      <Card className="p-5 space-y-2">
        <div className="flex items-center gap-3">
          <Label className="flex-1">{budgetPeriod === 'weekly' ? t('budgets.overallWeeklyBudget') : t('budgets.overallMonthlyBudget')}</Label>
          <Input
            type="number"
            step="0.01"
            value={totalBudget}
            onChange={(e) => setTotalBudget(e.target.value)}
            placeholder={t('common.optional')}
            className="w-32"
          />
        </div>
        {totalAmount > 0 && (
          <div>
            <ProgressBar pct={totalPct} />
            <p className="text-xs text-muted-foreground mt-1">
              {fmt(totalSpentPeriod, currency)} / {fmt(totalAmount, currency)} · {budgetPeriod === 'weekly' ? t('budgets.thisWeek', { pct: totalPct.toFixed(0) }) : t('budgets.thisMonth', { pct: totalPct.toFixed(0) })}
            </p>
          </div>
        )}
      </Card>

      <Card className="p-5 space-y-5">
        <p className="text-sm font-medium">{t('budgets.perCategory')}</p>
        {topLevel.length === 0 ? (
          <p className="text-sm text-muted-foreground">{t('budgets.noCategoriesYet')}</p>
        ) : (
          topLevel.map((c) => (
            <div key={c.id} className="space-y-5">
              <BudgetRow
                category={c}
                spent={spentByCategory[c.id] || 0}
                currency={currency}
                value={perCategory[c.id]}
                onChange={(v) => updateCatBudget(c.id, v)}
              />
              {childrenOf(c.id).map((sub) => (
                <BudgetRow
                  key={sub.id}
                  category={sub}
                  spent={spentByCategory[sub.id] || 0}
                  currency={currency}
                  value={perCategory[sub.id]}
                  onChange={(v) => updateCatBudget(sub.id, v)}
                  indent
                />
              ))}
            </div>
          ))
        )}
      </Card>
    </div>
  );
}
