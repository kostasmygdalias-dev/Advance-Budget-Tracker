import { Suspense, lazy } from 'react';
import { Toaster } from "@/components/ui/toaster"
import { QueryClientProvider } from '@tanstack/react-query'
import { queryClientInstance } from '@/lib/query-client'
import { BrowserRouter as Router, Route, Routes, Navigate } from 'react-router-dom';
import PageNotFound from './lib/PageNotFound';
import { AuthProvider, useAuth } from '@/lib/AuthContext';
import ScrollToTop from './components/ScrollToTop';
import ProtectedRoute from '@/components/ProtectedRoute';
import Layout from '@/components/Layout';

// Each page is its own chunk, so signing in (or any single page) only
// downloads and parses the JS that page actually needs — e.g. the Login
// screen no longer has to load Recharts, dnd-kit, date-fns, etc. up front.
const Dashboard = lazy(() => import('@/pages/Dashboard'));
const Transactions = lazy(() => import('@/pages/Transactions'));
const AddEditExpense = lazy(() => import('@/pages/AddEditExpense'));
const AddEditIncome = lazy(() => import('@/pages/AddEditIncome'));
const Categories = lazy(() => import('@/pages/Categories'));
const Recurring = lazy(() => import('@/pages/Recurring'));
const SettingsPage = lazy(() => import('@/pages/Settings'));
const Login = lazy(() => import('@/pages/Login'));

const PageSpinner = () => (
  <div className="fixed inset-0 flex items-center justify-center">
    <div className="w-8 h-8 border-4 border-slate-200 border-t-slate-800 rounded-full animate-spin"></div>
  </div>
);

const AuthenticatedApp = () => {
  const { isLoadingAuth } = useAuth();

  if (isLoadingAuth) return <PageSpinner />;

  return (
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
            <Route path="/settings" element={<SettingsPage />} />
          </Route>
        </Route>
        <Route path="*" element={<PageNotFound />} />
      </Routes>
    </Suspense>
  );
};


function App() {

  return (
    <AuthProvider>
      <QueryClientProvider client={queryClientInstance}>
        <Router>
          <ScrollToTop />
          <AuthenticatedApp />
        </Router>
        <Toaster />
      </QueryClientProvider>
    </AuthProvider>
  )
}

export default App
