import { useEffect, useState } from 'react';
import { Link, useLocation, Outlet, useNavigate } from 'react-router-dom';
import { LayoutDashboard, Receipt, Repeat, Target, FolderTree, PiggyBank, BarChart3, Settings as SettingsIcon, Wallet, LogOut, Crown, ChevronDown, Sun, Moon, Search, Menu } from 'lucide-react';
import { useAuth } from '@/lib/AuthContext';
import { useSubscription } from '@/hooks/use-subscription';
import { useDarkMode } from '@/hooks/use-dark-mode';
import { useLanguage } from '@/lib/i18n';
import { openBillingPortal } from '@/lib/subscription';
import { useToast } from '@/components/ui/use-toast';
import {
  DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuLabel,
  DropdownMenuSeparator, DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { Sheet, SheetContent, SheetHeader, SheetTitle, SheetTrigger } from '@/components/ui/sheet';
import CommandPalette from '@/components/CommandPalette';
import { cn } from '@/lib/utils';

const getNav = (t) => [
  { to: '/', label: t('nav.dashboard'), icon: LayoutDashboard, exact: true },
  { to: '/transactions', label: t('nav.transactions'), icon: Receipt },
  { to: '/recurring', label: t('nav.recurring'), icon: Repeat },
  { to: '/goals', label: t('nav.goals'), icon: Target },
  { to: '/categories', label: t('nav.categories'), icon: FolderTree },
  { to: '/budgets', label: t('nav.budgets'), icon: PiggyBank },
  { to: '/reports', label: t('nav.reports'), icon: BarChart3 },
  { to: '/settings', label: t('nav.settings'), icon: SettingsIcon },
];

function PlanBadge({ isPro }) {
  const { t } = useLanguage();
  return (
    <span
      className={cn(
        'text-[10px] font-semibold tracking-wide rounded-full px-1.5 py-0.5',
        isPro ? 'text-primary bg-primary/10' : 'text-muted-foreground bg-muted'
      )}
    >
      {isPro ? t('common.pro') : t('common.free')}
    </span>
  );
}

function AccountMenu({ user, isPro, billingConfigured, upgradeUrl, onLogout, onOpenPalette, children }) {
  const { toast } = useToast();
  const [isDark, toggleDark] = useDarkMode();
  const { t } = useLanguage();

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
          <p className="text-sm font-medium">{isPro ? t('accountMenu.proPlan') : t('accountMenu.freePlan')}</p>
          {user?.email && <p className="text-xs text-muted-foreground truncate">{user.email}</p>}
        </DropdownMenuLabel>
        {billingConfigured && (
          <>
            <DropdownMenuSeparator />
            {isPro ? (
              <DropdownMenuItem onSelect={manageSubscription}>
                <Crown className="w-4 h-4 mr-2" /> {t('accountMenu.manageSubscription')}
              </DropdownMenuItem>
            ) : (
              upgradeUrl && (
                <DropdownMenuItem onSelect={() => { window.location.href = upgradeUrl; }}>
                  <Crown className="w-4 h-4 mr-2" /> {t('accountMenu.upgradeToPro')}
                </DropdownMenuItem>
              )
            )}
          </>
        )}
        <DropdownMenuSeparator />
        <DropdownMenuItem onSelect={onOpenPalette} className="md:hidden">
          <Search className="w-4 h-4 mr-2" /> {t('accountMenu.quickSearch')}
        </DropdownMenuItem>
        <DropdownMenuItem onSelect={(e) => { e.preventDefault(); toggleDark(); }}>
          {isDark ? <Sun className="w-4 h-4 mr-2" /> : <Moon className="w-4 h-4 mr-2" />}
          {isDark ? t('accountMenu.lightMode') : t('accountMenu.darkMode')}
        </DropdownMenuItem>
        <DropdownMenuSeparator />
        <DropdownMenuItem onSelect={onLogout}>
          <LogOut className="w-4 h-4 mr-2" /> {t('accountMenu.logOut')}
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
  const [navOpen, setNavOpen] = useState(false);
  const { t } = useLanguage();
  const NAV = getNav(t);

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
        <div className="flex items-center h-16 border-b">
          <Link
            to="/"
            className="flex items-center gap-2 flex-1 min-w-0 h-full pl-6 pr-2 hover:bg-sidebar-accent/40 transition-colors"
          >
            <Wallet className="w-5 h-5 text-primary shrink-0" />
            <span className="font-heading font-semibold tracking-tight truncate">ExpenseTrack</span>
            {!subLoading && <PlanBadge isPro={isPro} />}
          </Link>
          <AccountMenu user={user} isPro={isPro} billingConfigured={billingConfigured} upgradeUrl={upgradeUrl} onLogout={handleLogout} onOpenPalette={() => setPaletteOpen(true)}>
            <button
              className="h-full px-3 flex items-center hover:bg-sidebar-accent/40 transition-colors shrink-0"
              aria-label={t('accountMenu.openMenu')}
            >
              <ChevronDown className="w-4 h-4 text-muted-foreground" />
            </button>
          </AccountMenu>
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
                    {t('common.pro')}
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
            <Search className="w-3.5 h-3.5" /> {t('accountMenu.quickSearch')}
            <kbd className="ml-auto text-[10px] font-mono text-sidebar-foreground/40">⌘K</kbd>
          </button>
        </div>
      </aside>

      <header className="md:hidden sticky top-0 z-30 flex items-center gap-1 px-2 h-14 border-b bg-background/95 backdrop-blur">
        <Sheet open={navOpen} onOpenChange={setNavOpen}>
          <SheetTrigger asChild>
            <button className="p-2 rounded-md hover:bg-muted transition-colors" aria-label={t('accountMenu.openMenu')}>
              <Menu className="w-5 h-5" />
            </button>
          </SheetTrigger>
          <SheetContent side="left" className="w-72 flex flex-col p-0">
            <SheetHeader className="flex-row items-center gap-2 px-6 h-16 border-b space-y-0 text-left">
              <Wallet className="w-5 h-5 text-primary shrink-0" />
              <SheetTitle className="flex-1 text-left truncate font-heading text-base tracking-tight">ExpenseTrack</SheetTitle>
              {!subLoading && <PlanBadge isPro={isPro} />}
            </SheetHeader>
            <nav className="flex-1 px-3 py-4 space-y-1 overflow-y-auto">
              {NAV.map((item) => {
                const Icon = item.icon;
                return (
                  <Link
                    key={item.to}
                    to={item.to}
                    onClick={() => setNavOpen(false)}
                    className={cn(
                      'flex items-center gap-3 px-3 py-2 rounded-md text-sm transition-colors',
                      isActive(item)
                        ? 'bg-muted text-foreground font-medium'
                        : 'text-muted-foreground hover:bg-muted/60'
                    )}
                  >
                    <Icon className="w-4 h-4" /> {item.label}
                    {item.to === '/recurring' && showProBadge && (
                      <span className="ml-auto text-[10px] font-semibold tracking-wide text-primary bg-primary/10 rounded-full px-1.5 py-0.5">
                        {t('common.pro')}
                      </span>
                    )}
                  </Link>
                );
              })}
            </nav>
          </SheetContent>
        </Sheet>
        <Link
          to="/"
          className="flex items-center gap-2 flex-1 min-w-0 px-2 py-1.5 rounded-md hover:bg-muted transition-colors"
        >
          <Wallet className="w-5 h-5 text-primary shrink-0" />
          <span className="font-heading font-semibold truncate">ExpenseTrack</span>
          {!subLoading && <PlanBadge isPro={isPro} />}
        </Link>
        <AccountMenu user={user} isPro={isPro} billingConfigured={billingConfigured} upgradeUrl={upgradeUrl} onLogout={handleLogout} onOpenPalette={() => setPaletteOpen(true)}>
          <button
            className="p-2 rounded-md hover:bg-muted transition-colors shrink-0"
            aria-label={t('accountMenu.openMenu')}
          >
            <ChevronDown className="w-4 h-4 text-muted-foreground" />
          </button>
        </AccountMenu>
      </header>

      <main className="md:pl-60">
        <div className="max-w-5xl mx-auto px-4 md:px-8 py-6 md:py-10">
          <Outlet />
        </div>
      </main>

      <CommandPalette open={paletteOpen} onOpenChange={setPaletteOpen} />
    </div>
  );
}