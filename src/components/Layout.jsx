import { useEffect, useState } from 'react';
import { Link, useLocation, Outlet, useNavigate } from 'react-router-dom';
import { LayoutDashboard, Receipt, Repeat, Target, PiggyBank, BarChart3, Settings as SettingsIcon, Wallet, LogOut, Crown, ChevronDown, Sun, Moon, Search } from 'lucide-react';
import { useAuth } from '@/lib/AuthContext';
import { useSubscription } from '@/hooks/use-subscription';
import { useDarkMode } from '@/hooks/use-dark-mode';
import { openBillingPortal } from '@/lib/subscription';
import { useToast } from '@/components/ui/use-toast';
import {
  DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuLabel,
  DropdownMenuSeparator, DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import CommandPalette from '@/components/CommandPalette';
import { cn } from '@/lib/utils';

const NAV = [
  { to: '/', label: 'Dashboard', icon: LayoutDashboard, exact: true },
  { to: '/transactions', label: 'Transactions', icon: Receipt },
  { to: '/recurring', label: 'Recurring', icon: Repeat },
  { to: '/goals', label: 'Goals', icon: Target },
  { to: '/budgets', label: 'Budgets', icon: PiggyBank },
  { to: '/reports', label: 'Reports', icon: BarChart3 },
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

function AccountMenu({ user, isPro, billingConfigured, upgradeUrl, onLogout, onOpenPalette, children }) {
  const { toast } = useToast();
  const [isDark, toggleDark] = useDarkMode();

  const manageSubscription = async () => {
    try {
      await openBillingPortal();
    } catch (err) {
      toast({ title: 'Could not open billing portal', description: err.message, variant: 'destructive' });
    }
  };

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>{children}</DropdownMenuTrigger>
      <DropdownMenuContent align="start" className="w-56">
        <DropdownMenuLabel className="font-normal">
          <p className="text-sm font-medium">{isPro ? 'Pro plan' : 'Free plan'}</p>
          {user?.email && <p className="text-xs text-muted-foreground truncate">{user.email}</p>}
        </DropdownMenuLabel>
        {billingConfigured && (
          <>
            <DropdownMenuSeparator />
            {isPro ? (
              <DropdownMenuItem onSelect={manageSubscription}>
                <Crown className="w-4 h-4 mr-2" /> Manage subscription
              </DropdownMenuItem>
            ) : (
              upgradeUrl && (
                <DropdownMenuItem onSelect={() => { window.location.href = upgradeUrl; }}>
                  <Crown className="w-4 h-4 mr-2" /> Upgrade to Pro
                </DropdownMenuItem>
              )
            )}
          </>
        )}
        <DropdownMenuSeparator />
        <DropdownMenuItem onSelect={onOpenPalette} className="md:hidden">
          <Search className="w-4 h-4 mr-2" /> Quick search
        </DropdownMenuItem>
        <DropdownMenuItem onSelect={(e) => { e.preventDefault(); toggleDark(); }}>
          {isDark ? <Sun className="w-4 h-4 mr-2" /> : <Moon className="w-4 h-4 mr-2" />}
          {isDark ? 'Light mode' : 'Dark mode'}
        </DropdownMenuItem>
        <DropdownMenuSeparator />
        <DropdownMenuItem onSelect={onLogout}>
          <LogOut className="w-4 h-4 mr-2" /> Log out
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}

export default function Layout() {
  const location = useLocation();
  const navigate = useNavigate();
  const { logout, user } = useAuth();
  const { active: subActive, configured: billingConfigured, loading: subLoading, upgradeUrl } = useSubscription();
  const isPro = billingConfigured && subActive;
  const showProBadge = billingConfigured && !subActive;
  const [paletteOpen, setPaletteOpen] = useState(false);

  useEffect(() => {
    const onKeyDown = (e) => {
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === 'k') {
        e.preventDefault();
        setPaletteOpen((o) => !o);
      }
    };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, []);

  const handleLogout = async () => {
    await logout();
    navigate('/login', { replace: true });
  };

  const isActive = (item) =>
    item.exact ? location.pathname === item.to : location.pathname.startsWith(item.to);

  return (
    <div className="min-h-screen bg-background">
      <aside className="hidden md:flex fixed inset-y-0 left-0 w-60 flex-col border-r bg-sidebar">
        <AccountMenu user={user} isPro={isPro} billingConfigured={billingConfigured} upgradeUrl={upgradeUrl} onLogout={handleLogout} onOpenPalette={() => setPaletteOpen(true)}>
          <button className="flex items-center gap-2 px-6 h-16 border-b w-full hover:bg-sidebar-accent/40 transition-colors">
            <Wallet className="w-5 h-5 text-primary shrink-0" />
            <span className="font-heading font-semibold tracking-tight flex-1 text-left truncate">ExpenseTrack</span>
            {!subLoading && <PlanBadge isPro={isPro} />}
            <ChevronDown className="w-4 h-4 text-muted-foreground shrink-0" />
          </button>
        </AccountMenu>
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
            onClick={() => setPaletteOpen(true)}
            className="flex items-center gap-2 px-3 py-2 w-full rounded-md text-sm text-sidebar-foreground/60 hover:bg-sidebar-accent/60 border border-dashed border-sidebar-border"
          >
            <Search className="w-3.5 h-3.5" /> Quick search
            <kbd className="ml-auto text-[10px] font-mono text-sidebar-foreground/40">⌘K</kbd>
          </button>
        </div>
      </aside>

      <header className="md:hidden sticky top-0 z-30 flex items-center px-4 h-14 border-b bg-background/95 backdrop-blur">
        <AccountMenu user={user} isPro={isPro} billingConfigured={billingConfigured} upgradeUrl={upgradeUrl} onLogout={handleLogout} onOpenPalette={() => setPaletteOpen(true)}>
          <button className="flex items-center gap-2">
            <Wallet className="w-5 h-5 text-primary" />
            <span className="font-heading font-semibold">ExpenseTrack</span>
            {!subLoading && <PlanBadge isPro={isPro} />}
            <ChevronDown className="w-4 h-4 text-muted-foreground" />
          </button>
        </AccountMenu>
      </header>

      <main className="md:pl-60 pb-20 md:pb-0">
        <div className="max-w-5xl mx-auto px-4 md:px-8 py-6 md:py-10">
          <Outlet />
        </div>
      </main>

      <nav className="md:hidden fixed bottom-0 inset-x-0 z-30 flex border-t bg-background overflow-x-auto">
        {NAV.map((item) => {
          const Icon = item.icon;
          return (
            <Link
              key={item.to}
              to={item.to}
              className={cn(
                'relative flex-1 shrink-0 min-w-[64px] flex flex-col items-center gap-1 py-2 text-[11px]',
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

      <CommandPalette open={paletteOpen} onOpenChange={setPaletteOpen} />
    </div>
  );
}