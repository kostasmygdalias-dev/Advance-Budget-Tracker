import { useEffect, useRef } from 'react';
import { generateDueRecurring } from '@/lib/recurring';
import { todayStr } from '@/lib/finance';
import { useToast } from '@/components/ui/use-toast';
import { useLanguage } from '@/lib/i18n';

// Creates any recurring entries that have come due, on every app open rather
// than only when someone happens to visit the Recurring page — otherwise
// this month's rent stayed out of the Dashboard and the transaction list
// until they did. There's no server to do it on the due date itself, so
// "whenever the app is opened on or after it" is the closest equivalent.
// Also re-runs when a tab left open comes back into view on a later day,
// since an installed PWA can sit open across a month boundary.
export function useRecurringCatchUp(enabled, onGenerated) {
  const { toast } = useToast();
  const { t } = useLanguage();
  const lastRunDay = useRef(null);
  const onGeneratedRef = useRef(onGenerated);
  onGeneratedRef.current = onGenerated;

  useEffect(() => {
    if (!enabled) return undefined;

    const run = () => {
      const today = todayStr();
      if (lastRunDay.current === today) return;
      lastRunDay.current = today;
      generateDueRecurring()
        .then((count) => {
          if (count === 0) return;
          toast({
            title: count === 1
              ? t('recurring.entriesAddedOne', { count })
              : t('recurring.entriesAddedOther', { count }),
            description: t('recurring.generatedAutomatically'),
          });
          onGeneratedRef.current?.();
        })
        // Silent: the Recurring page retries on its own load, and a
        // background task shouldn't raise an error nobody asked for. Clearing
        // the day lets the next visibility change try again.
        .catch(() => { lastRunDay.current = null; });
    };

    run();
    const onVisible = () => { if (document.visibilityState === 'visible') run(); };
    document.addEventListener('visibilitychange', onVisible);
    return () => document.removeEventListener('visibilitychange', onVisible);
  }, [enabled]);
}
