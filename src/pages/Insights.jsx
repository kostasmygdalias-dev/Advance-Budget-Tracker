import { useEffect, useState } from 'react';
import { entities } from '@/lib/sheetsStore';
import { Card } from '@/components/ui/card';
import { CategoryIcon, IconAvatar, UNCATEGORIZED_COLOR } from '@/lib/categoryIcons';
import { currentMonthStr, getRecentMonths, monthLabel, fmt, formatDateDMY } from '@/lib/finance';
import { getBiggestExpense, getTopCategory, getBurnRate, getUnusualExpense, getRecurringSplit } from '@/lib/insights';
import { useCategoriesQuery, useSettingsQuery } from '@/hooks/useEntities';
import LoadError from '@/components/LoadError';
import PageSkeleton from '@/components/PageSkeleton';
import UpgradePrompt from '@/components/UpgradePrompt';
import { useSubscription } from '@/hooks/use-subscription';
import { useLanguage } from '@/lib/i18n';

const RECURRING_COLOR = '#0ea5e9';
const VARIABLE_COLOR = '#94a3b8';

// The whole page is this month only — the same five figures the Dashboard
// can show as individual widgets (see the biggestExpense/topCategory/
// burnRate/unusualExpense/recurringSplit cases there), but spelled out with
// the context a one-number card has no room for. Calculations live in
// src/lib/insights.js so both render the same numbers.
export default function Insights() {
  const { t, lang } = useLanguage();
  const { active: subActive, loading: subLoading, configured: billingConfigured, upgradeUrl } = useSubscription();
  const catQuery = useCategoriesQuery();
  const setQuery = useSettingsQuery();
  const categories = catQuery.data || [];
  const settings = setQuery.data?.[0] || null;
  const [expenses, setExpenses] = useState([]);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState(null);

  const load = () => {
    setLoading(true);
    setLoadError(null);
    (async () => {
      try {
        setExpenses(await entities.Expense.list('-paid_date', 500));
      } catch (err) {
        setLoadError(err);
      } finally {
        setLoading(false);
      }
    })();
  };

  useEffect(load, []);

  if (loading || subLoading || catQuery.isLoading || setQuery.isLoading) return <PageSkeleton rows={3} />;
  if (loadError || catQuery.error || setQuery.error) {
    return (
      <LoadError
        error={loadError || catQuery.error || setQuery.error}
        onRetry={() => { load(); catQuery.refetch(); setQuery.refetch(); }}
      />
    );
  }
  if (billingConfigured && !subActive) {
    return (
      <UpgradePrompt
        upgradeUrl={upgradeUrl}
        title={t('insights.upgradeTitle')}
        description={t('insights.upgradeDescription')}
        features={[t('insights.upgradeFeature1'), t('insights.upgradeFeature2'), t('insights.upgradeFeature3')]}
      />
    );
  }

  const currency = settings?.default_currency || 'EUR';
  const thisMonth = currentMonthStr();
  const [lastMonth] = getRecentMonths(2);
  const catMap = {};
  categories.forEach((c) => { catMap[c.id] = c; });

  const biggest = getBiggestExpense({ expenses, month: thisMonth, currency });
  const topCategory = getTopCategory({
    expenses, categories, month: thisMonth, prevMonth: lastMonth, currency,
    uncategorizedLabel: t('transactions.uncategorized'),
  });
  const burnRate = getBurnRate({ expenses, month: thisMonth, currency, today: new Date() });
  const unusual = getUnusualExpense({ expenses, month: thisMonth, currency });
  const recurringSplit = getRecurringSplit({ expenses, month: thisMonth, currency });

  const biggestCat = biggest?.expense.category_id ? catMap[biggest.expense.category_id] : null;
  const unusualCat = unusual?.expense.category_id ? catMap[unusual.expense.category_id] : null;

  return (
    <div className="space-y-8">
      <div>
        <h1 className="text-2xl font-heading font-semibold tracking-tight">{t('insights.title')}</h1>
        <p className="text-sm text-muted-foreground">{monthLabel(thisMonth, lang)}</p>
      </div>

      <div className="grid gap-4 lg:grid-cols-2">
        <Card className="p-5">
          <p className="text-sm font-medium mb-4">{t('insights.biggestExpenseTitle')}</p>
          {biggest ? (
            <div className="flex items-center gap-3">
              <IconAvatar icon={(props) => <CategoryIcon name={biggestCat?.icon} {...props} />} color={biggestCat?.color || UNCATEGORIZED_COLOR} className="w-10 h-10" />
              <div className="flex-1 min-w-0">
                <p className="text-sm font-medium truncate">{biggest.expense.description}</p>
                <p className="text-xs text-muted-foreground truncate">
                  {biggestCat ? `${biggestCat.name} · ` : ''}{formatDateDMY(biggest.expense.paid_date)}
                </p>
              </div>
              <span className="text-lg font-heading font-semibold tabular-nums shrink-0">{fmt(biggest.contribution, currency)}</span>
            </div>
          ) : (
            <p className="text-sm text-muted-foreground">{t('insights.noSpendingThisMonth')}</p>
          )}
        </Card>

        <Card className="p-5">
          <p className="text-sm font-medium mb-4">{t('insights.topCategoryTitle')}</p>
          {topCategory ? (
            <div className="flex items-center gap-3">
              <IconAvatar icon={(props) => <CategoryIcon name={topCategory.category.icon} {...props} />} color={topCategory.category.color} className="w-10 h-10" />
              <div className="flex-1 min-w-0">
                <p className="text-sm font-medium truncate">{topCategory.category.name}</p>
                <p className="text-xs text-muted-foreground truncate">
                  {topCategory.deltaPct === null
                    ? t('insights.newThisMonth')
                    : (
                      <span className={topCategory.deltaPct >= 0 ? 'text-red-500' : 'text-emerald-600'}>
                        {t('insights.vsLastMonth', {
                          delta: `${topCategory.deltaPct >= 0 ? '+' : ''}${Math.round(topCategory.deltaPct)}`,
                          amount: fmt(topCategory.prevTotal, currency),
                        })}
                      </span>
                    )}
                </p>
              </div>
              <span className="text-lg font-heading font-semibold tabular-nums shrink-0">{fmt(topCategory.category.total, currency)}</span>
            </div>
          ) : (
            <p className="text-sm text-muted-foreground">{t('insights.noSpendingThisMonth')}</p>
          )}
        </Card>

        <Card className="p-5">
          <p className="text-sm font-medium mb-4">{t('insights.burnRateTitle')}</p>
          {burnRate ? (
            <div className="space-y-3">
              <div>
                <p className="text-xs text-muted-foreground">{t('insights.projectedTotal')}</p>
                <p className="text-2xl font-heading font-semibold tabular-nums">{fmt(burnRate.projectedTotal, currency)}</p>
              </div>
              <div className="h-2 rounded-full bg-muted overflow-hidden">
                <div
                  className="h-full rounded-full bg-foreground/60 transition-all"
                  style={{ width: `${(burnRate.daysElapsed / burnRate.daysInMonth) * 100}%` }}
                />
              </div>
              <p className="text-xs text-muted-foreground">
                {t('insights.spentSoFarOf', { spent: fmt(burnRate.spentSoFar, currency) })}
                {' · '}
                {t('insights.dayOfMonth', { day: burnRate.daysElapsed, days: burnRate.daysInMonth })}
                {' · '}
                {t('insights.dailyAverage', { amount: fmt(burnRate.dailyAvg, currency) })}
              </p>
            </div>
          ) : (
            <p className="text-sm text-muted-foreground">{t('insights.noSpendingThisMonth')}</p>
          )}
        </Card>

        <Card className="p-5">
          <p className="text-sm font-medium mb-4">{t('insights.unusualExpenseTitle')}</p>
          {unusual ? (
            <div className="space-y-2">
              <div className="flex items-center gap-3">
                <IconAvatar icon={(props) => <CategoryIcon name={unusualCat?.icon} {...props} />} color={unusualCat?.color || UNCATEGORIZED_COLOR} className="w-10 h-10" />
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-medium truncate">{unusual.expense.description}</p>
                  <p className="text-xs text-muted-foreground truncate">{formatDateDMY(unusual.expense.paid_date)}</p>
                </div>
                <span className="text-lg font-heading font-semibold tabular-nums shrink-0">{fmt(unusual.expense.amount, currency)}</span>
              </div>
              <p className="text-xs text-muted-foreground">
                {t('insights.unusualRatio', {
                  ratio: unusual.ratio.toFixed(1),
                  category: unusualCat?.name || t('transactions.uncategorized'),
                  average: fmt(unusual.categoryMean, currency),
                })}
              </p>
            </div>
          ) : (
            <p className="text-sm text-muted-foreground">{t('insights.nothingUnusual')}</p>
          )}
        </Card>

        <Card className="p-5">
          <p className="text-sm font-medium mb-4">{t('insights.recurringSplitTitle')}</p>
          {recurringSplit ? (
            <div className="space-y-3">
              <div className="flex h-2 rounded-full overflow-hidden bg-muted">
                <div style={{ width: `${recurringSplit.recurringPct}%`, background: RECURRING_COLOR }} />
                <div style={{ width: `${100 - recurringSplit.recurringPct}%`, background: VARIABLE_COLOR }} />
              </div>
              <div className="flex items-center justify-between gap-3 text-sm">
                <span className="flex items-center gap-2 min-w-0">
                  <span className="w-3 h-3 rounded-full shrink-0" style={{ background: RECURRING_COLOR }} />
                  <span className="truncate">{t('insights.recurringLabel')}</span>
                </span>
                <span className="tabular-nums font-medium shrink-0">{fmt(recurringSplit.recurringTotal, currency)}</span>
              </div>
              <div className="flex items-center justify-between gap-3 text-sm">
                <span className="flex items-center gap-2 min-w-0">
                  <span className="w-3 h-3 rounded-full shrink-0" style={{ background: VARIABLE_COLOR }} />
                  <span className="truncate">{t('insights.variableLabel')}</span>
                </span>
                <span className="tabular-nums font-medium shrink-0">{fmt(recurringSplit.variableTotal, currency)}</span>
              </div>
              <p className="text-xs text-muted-foreground">
                {t('insights.recurringShare', { pct: Math.round(recurringSplit.recurringPct) })}
              </p>
            </div>
          ) : (
            <p className="text-sm text-muted-foreground">{t('insights.noSpendingThisMonth')}</p>
          )}
        </Card>
      </div>
    </div>
  );
}
