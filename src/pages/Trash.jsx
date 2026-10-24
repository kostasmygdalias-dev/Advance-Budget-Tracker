import { useEffect, useState } from 'react';
import { listTrash, restoreFromTrash, TRASH_KEEP_MS } from '@/lib/sheetsStore';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { useToast } from '@/components/ui/use-toast';
import { RotateCcw } from 'lucide-react';
import { fmt, formatDateDMY } from '@/lib/finance';
import LoadError from '@/components/LoadError';
import PageSkeleton from '@/components/PageSkeleton';
import { useLanguage } from '@/lib/i18n';

// Expenses and income deleted in the last day, each restorable as the same
// record it was. Anything older is pruned by listTrash() itself.
export default function Trash() {
  const { toast } = useToast();
  const { t } = useLanguage();
  const [items, setItems] = useState([]);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState(null);
  const [restoringId, setRestoringId] = useState(null);

  const load = () => {
    setLoading(true);
    setLoadError(null);
    listTrash()
      .then(setItems)
      .catch(setLoadError)
      .finally(() => setLoading(false));
  };

  useEffect(load, []);

  const restore = async (item) => {
    setRestoringId(item.id);
    try {
      await restoreFromTrash([item]);
      setItems((prev) => prev.filter((i) => i.id !== item.id));
      toast({ title: t('trash.restored', { description: item.record.description }) });
    } catch (err) {
      toast({ title: t('trash.couldNotRestore'), description: err.message, variant: 'destructive' });
      load();
    } finally {
      setRestoringId(null);
    }
  };

  if (loading) return <PageSkeleton />;
  if (loadError) return <LoadError error={loadError} onRetry={load} />;

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-heading font-semibold tracking-tight">{t('trash.title')}</h1>
        <p className="text-sm text-muted-foreground">{t('trash.subtitle')}</p>
      </div>

      {items.length === 0 ? (
        <p className="text-sm text-muted-foreground py-8 text-center">{t('trash.empty')}</p>
      ) : (
        <div className="space-y-2">
          {items.map((item) => {
            const r = item.record;
            const isIncome = item.entity === 'income';
            const hoursLeft = Math.max(1, Math.ceil((new Date(item.created_date).getTime() + TRASH_KEEP_MS - Date.now()) / 3600000));
            return (
              <Card key={item.id} className="p-4 flex items-center gap-3">
                <div className="flex-1 min-w-0">
                  <p className="font-medium truncate">{r.description}</p>
                  <p className="text-xs text-muted-foreground mt-0.5">
                    {isIncome ? t('common.income') : t('common.expense')}
                    {` · ${formatDateDMY(r.paid_date || r.received_date)}`}
                    {` · ${hoursLeft === 1 ? t('trash.hoursLeftOne', { n: hoursLeft }) : t('trash.hoursLeftOther', { n: hoursLeft })}`}
                  </p>
                </div>
                <p className={`font-semibold tabular-nums shrink-0 whitespace-nowrap ${isIncome ? 'text-emerald-600' : ''}`}>
                  {isIncome ? '+' : '-'}{fmt(r.amount, r.currency)}
                </p>
                <Button
                  variant="outline" size="sm" onClick={() => restore(item)} disabled={restoringId === item.id}
                  aria-label={t('trash.restoreButton', { description: r.description })}
                >
                  <RotateCcw className="w-4 h-4 sm:mr-1" /> <span className="hidden sm:inline">{t('trash.restore')}</span>
                </Button>
              </Card>
            );
          })}
        </div>
      )}
    </div>
  );
}
