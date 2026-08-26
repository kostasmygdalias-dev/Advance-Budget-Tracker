import { Suspense, lazy, useEffect } from 'react';
import { Toaster } from "@/components/ui/toaster"
import { QueryClientProvider } from '@tanstack/react-query'
import { queryClientInstance } from '@/lib/query-client'
import { HashRouter as Router, Route, Routes, Navigate } from 'react-router-dom';
import PageNotFound from './lib/PageNotFound';
import { AuthProvider, useAuth } from '@/lib/AuthContext';
import { LanguageProvider } from '@/lib/i18n';
import ScrollToTop from './components/ScrollToTop';
import ProtectedRoute from '@/components/ProtectedRoute';
import Layout from '@/components/Layout';
import ChunkErrorBoundary, { clearChunkReloadFlag } from '@/components/ChunkErrorBoundary';

// Each page is its own chunk, so signing in (or any single page) only
// downloads and parses the JS that page actually needs — e.g. the Login
// screen no longer has to load Recharts, dnd-kit, date-fns, etc. up front.
const Dashboard = lazy(() => import('@/pages/Dashboard'));
const Transactions = lazy(() => import('@/pages/Transactions'));
const AddEditExpense = lazy(() => import('@/pages/AddEditExpense'));
const AddEditIncome = lazy(() => import('@/pages/AddEditIncome'));
const Categories = lazy(() => import('@/pages/Categories'));
const Recurring = lazy(() => import('@/pages/Recurring'));
const Goals = lazy(() => import('@/pages/Goals'));
const Reports = lazy(() => import('@/pages/Reports'));
const Budgets = lazy(() => import('@/pages/Budgets'));
const SettingsPage = lazy(() => import('@/pages/Settings'));
const Upgrade = lazy(() => import('@/pages/Upgrade'));
const Login = lazy(() => import('@/pages/Login'));

const PageSpinner = () => (
  <div className="fixed inset-0 flex items-center justify-center">
    <div className="w-8 h-8 border-4 border-slate-200 border-t-slate-800 rounded-full animate-spin"></div>
  </div>
);

const AuthenticatedApp = () => {
  const { isLoadingAuth } = useAuth();

  // The app rendered past loading, so it's on a current bundle — safe to
  // let a *future* deploy trigger the auto-reload again in this same tab.
  useEffect(() => {
    if (!isLoadingAuth) clearChunkReloadFlag();
  }, [isLoadingAuth]);

  if (isLoadingAuth) return <PageSpinner />;

  return (
    <ChunkErrorBoundary>
      <Suspense fallback={<PageSpinner />}>
        <Routes>
          <Route path="/login" element={<Login />} />
          <Route element={<ProtectedRoute />}>
            <Route element={<Layout />}>
              <Route path="/" element={<Dashboard />} />
              <Route path="/transactions" element={<Transactions />} />
              <Route path="/expenses" element={<Navigate to="/transactions?type=expense" replace />} />
              <Route path="/expenses/new" element={<AddEditExpense />} />
              <Route path="/expenses/:id/edit" element={<AddEditExpense />} />
              <Route path="/income" element={<Navigate to="/transactions?type=income" replace />} />
              <Route path="/income/new" element={<AddEditIncome />} />
              <Route path="/income/:id/edit" element={<AddEditIncome />} />
              <Route path="/categories" element={<Categories />} />
              <Route path="/recurring" element={<Recurring />} />
              <Route path="/goals" element={<Goals />} />
              <Route path="/reports" element={<Reports />} />
              <Route path="/budgets" element={<Budgets />} />
              <Route path="/settings" element={<SettingsPage />} />
              <Route path="/upgrade" element={<Upgrade />} />
            </Route>
          </Route>
          <Route path="*" element={<PageNotFound />} />
        </Routes>
      </Suspense>
    </ChunkErrorBoundary>
  );
};


function App() {

  return (
    <LanguageProvider>
      <AuthProvider>
        <QueryClientProvider client={queryClientInstance}>
          {/* HashRouter, not BrowserRouter: the live host serves this app
              through nginx, which returns a bare 404 for any path other than
              "/" (no SPA-fallback rewrite, unlike the Apache the .htaccess
              file assumes). Hash routes (/#/settings) never leave the client,
              so refreshing or deep-linking any route always works regardless
              of server config. */}
          <Router>
            <ScrollToTop />
            <AuthenticatedApp />
          </Router>
          <Toaster />
        </QueryClientProvider>
      </AuthProvider>
    </LanguageProvider>
  )
}

export default App
