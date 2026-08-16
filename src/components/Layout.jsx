import { Link, useLocation, Outlet, useNavigate } from 'react-router-dom';
import { LayoutDashboard, Receipt, TrendingUp, FolderTree, Repeat, Settings as SettingsIcon, Wallet, LogOut } from 'lucide-react';
import { useAuth } from '@/lib/AuthContext';
import { useSubscription } from '@/hooks/use-subscription';
import { cn } from '@/lib/utils';

const NAV = [
  { to: '/', label: 'Dashboard', icon: LayoutDashboard, exact: true },
  { to: '/income', label: 'Income', icon: TrendingUp },
  { to: '/expenses', label: 'Expenses', icon: Receipt },
  { to: '/categories', label: 'Categories', icon: FolderTree },
  { to: '/recurring', label: 'Recurring', icon: Repeat },
  { to: '/settings', label: 'Settings', icon: SettingsIcon },
];

function PlanBadge({ isPro }) {
  return (
    <span
      className={cn(
        'text-[10px] font-semibold tracking-wide rounded-full px-1.5 py-0.5',
        isPro ? 'text-primary bg-primary/10' : 'text-muted-foreground bg-muted'
      )}
    >
      {isPro ? 'PRO' : 'FREE'}
    </span>
  );
}

export default function Layout() {
  const location = useLocation();
  const navigate = useNavigate();
  const { logout } = useAuth();
  const { active: subActive, configured: billingConfigured, loading: subLoading } = useSubscription();
  const isPro = billingConfigured && subActive;
  const showProBadge = billingConfigured && !subActive;

  const handleLogout = async () => {
    await logout();
    navigate('/login', { replace: true });
  };

  const isActive = (item) =>
    item.exact ? location.pathname === item.to : location.pathname.startsWith(item.to);

  return (
    <div className="min-h-screen bg-background">
      <aside className="hidden md:flex fixed inset-y-0 left-0 w-60 flex-col border-r bg-sidebar">
        <div className="flex items-center gap-2 px-6 h-16 border-b">
          <Wallet className="w-5 h-5 text-primary" />
          <span className="font-heading font-semibold tracking-tight">ExpenseTrack</span>
          {!subLoading && <PlanBadge isPro={isPro} />}
        </div>
        <nav className="flex-1 px-3 py-4 space-y-1">
          {NAV.map((item) => {
            const Icon = item.icon;
            return (
              <Link
                key={item.to}
                to={item.to}
                className={cn(
                  'flex items-center gap-3 px-3 py-2 rounded-md text-sm transition-colors',
                  isActive(item)
                    ? 'bg-sidebar-accent text-sidebar-accent-foreground font-medium'
                    : 'text-sidebar-foreground/70 hover:bg-sidebar-accent/60'
                )}
              >
                <Icon className="w-4 h-4" /> {item.label}
                {item.to === '/recurring' && showProBadge && (
                  <span className="ml-auto text-[10px] font-semibold tracking-wide text-primary bg-primary/10 rounded-full px-1.5 py-0.5">
                    PRO
                  </span>
                )}
              </Link>
            );
          })}
        </nav>
        <div className="p-3 border-t">
          <button
            onClick={handleLogout}
            className="flex items-center gap-3 px-3 py-2 w-full rounded-md text-sm text-sidebar-foreground/70 hover:bg-sidebar-accent/60"
          >
            <LogOut className="w-4 h-4" /> Log out
          </button>
        </div>
      </aside>

      <header className="md:hidden sticky top-0 z-30 flex items-center justify-between px-4 h-14 border-b bg-background/95 backdrop-blur">
        <div className="flex items-center gap-2">
          <Wallet className="w-5 h-5 text-primary" />
          <span className="font-heading font-semibold">ExpenseTrack</span>
          {!subLoading && <PlanBadge isPro={isPro} />}
        </div>
        <button onClick={handleLogout} aria-label="Log out">
          <LogOut className="w-5 h-5 text-muted-foreground" />
        </button>
      </header>

      <main className="md:pl-60 pb-20 md:pb-0">
        <div className="max-w-5xl mx-auto px-4 md:px-8 py-6 md:py-10">
          <Outlet />
        </div>
      </main>

      <nav className="md:hidden fixed bottom-0 inset-x-0 z-30 flex border-t bg-background">
        {NAV.map((item) => {
          const Icon = item.icon;
          return (
            <Link
              key={item.to}
              to={item.to}
              className={cn(
                'relative flex-1 flex flex-col items-center gap-1 py-2 text-[11px]',
                isActive(item) ? 'text-primary' : 'text-muted-foreground'
              )}
            >
              <Icon className="w-5 h-5" />
              {item.label}
              {item.to === '/recurring' && showProBadge && (
                <span className="absolute top-1 right-1/2 -mr-4 w-1.5 h-1.5 rounded-full bg-primary" />
              )}
            </Link>
          );
        })}
      </nav>
    </div>
  );
}