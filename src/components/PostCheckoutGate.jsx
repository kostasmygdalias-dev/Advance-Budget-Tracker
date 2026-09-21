import { useEffect } from 'react';
import { useAuth } from '@/lib/AuthContext';
import { useLanguage } from '@/lib/i18n';
import { useToast } from '@/components/ui/use-toast';
import { isBillingConfigured, waitForActiveSubscription } from '@/lib/subscription';

// The Stripe Payment Link's "after payment" redirect points at
// <app>/?upgraded=1 (see BILLING_SETUP.md). On that landing: wait for the
// Worker to confirm Pro is active, then hard-reload to a clean home URL so
// every component that reads subscription state (each keeps its own copy)
// starts fresh — instead of the user landing on a Free-looking app and
// having to refresh by hand. The result is handed across the reload through
// sessionStorage so the welcome toast can show on the fresh page.
const RESULT_KEY = 'expensetrack_checkout_result';

export default function PostCheckoutGate({ children }) {
  const { isAuthenticated } = useAuth();
  const { t } = useLanguage();
  const { toast } = useToast();
  const returning = new URLSearchParams(window.location.search).get('upgraded') === '1'
    && isBillingConfigured();

  useEffect(() => {
    if (!isAuthenticated) return;
    const result = sessionStorage.getItem(RESULT_KEY);
    if (!result) return;
    sessionStorage.removeItem(RESULT_KEY);
    toast(result === 'active'
      ? { title: t('upgrade.welcomeProTitle'), description: t('upgrade.welcomeProBody') }
      : { title: t('upgrade.pendingTitle'), description: t('upgrade.pendingBody') });
  }, [isAuthenticated]);

  useEffect(() => {
    if (!returning || !isAuthenticated) return undefined;
    let cancelled = false;
    waitForActiveSubscription({ shouldStop: () => cancelled }).then((active) => {
      if (cancelled) return;
      sessionStorage.setItem(RESULT_KEY, active ? 'active' : 'pending');
      window.location.replace(`${window.location.origin}/#/`);
    });
    return () => { cancelled = true; };
  }, [returning, isAuthenticated]);

  if (returning && isAuthenticated) {
    return (
      <div className="fixed inset-0 flex flex-col items-center justify-center gap-4 p-6 text-center">
        <div className="w-8 h-8 border-4 border-slate-200 border-t-slate-800 rounded-full animate-spin" />
        <p className="text-sm text-muted-foreground">{t('upgrade.activating')}</p>
      </div>
    );
  }
  return children;
}
