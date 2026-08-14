import { useEffect, useState } from 'react';
import { useAuth } from '@/lib/AuthContext';
import { fetchSubscriptionStatus, isBillingConfigured, getUpgradeUrl } from '@/lib/subscription';

// Defaults to active while the check is in flight so gated UI doesn't flash
// "locked" for a moment before settling — the real answer (Worker call) is
// fast, and this avoids penalizing paying users with a flicker on load.
export function useSubscription() {
  const { user, isAuthenticated } = useAuth();
  const [state, setState] = useState({ active: true, status: 'loading', loading: true });

  useEffect(() => {
    if (!isAuthenticated) return;
    let cancelled = false;
    fetchSubscriptionStatus().then((result) => {
      if (!cancelled) setState({ ...result, loading: false });
    });
    return () => { cancelled = true; };
  }, [isAuthenticated]);

  return {
    ...state,
    configured: isBillingConfigured(),
    upgradeUrl: getUpgradeUrl(user),
  };
}
