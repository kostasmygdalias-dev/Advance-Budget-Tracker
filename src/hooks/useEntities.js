// Categories and Settings are fetched, unchanged, on nearly every page —
// Dashboard, Transactions, Reports, and Budgets each issued their own
// identical pair of Sheets API calls on every visit. Caching them here
// means navigating between those pages reuses the last fetch instead of
// re-requesting the same rows. A short staleTime (not Infinity) still picks
// up changes made in another tab within a session; every mutation site
// (Categories, Budgets, Settings, Dashboard's layout save) also invalidates
// explicitly so a page landing on stale cached data is never left stale.
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { entities } from '@/lib/sheetsStore';

const STALE_TIME = 60_000;

export function useCategoriesQuery() {
  return useQuery({ queryKey: ['categories'], queryFn: () => entities.Category.list(), staleTime: STALE_TIME });
}

export function useSettingsQuery() {
  return useQuery({ queryKey: ['settings'], queryFn: () => entities.Settings.list(), staleTime: STALE_TIME });
}

export function useInvalidateCategories() {
  const queryClient = useQueryClient();
  return () => queryClient.invalidateQueries({ queryKey: ['categories'] });
}

export function useInvalidateSettings() {
  const queryClient = useQueryClient();
  return () => queryClient.invalidateQueries({ queryKey: ['settings'] });
}
