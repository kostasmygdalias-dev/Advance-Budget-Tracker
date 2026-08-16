import { useNavigate } from 'react-router-dom';
import { LayoutDashboard, Receipt, Repeat, Target, Settings as SettingsIcon, Plus, TrendingDown, TrendingUp, FolderTree, BarChart3, Wallet } from 'lucide-react';
import {
  CommandDialog, CommandInput, CommandList, CommandEmpty, CommandGroup, CommandItem,
} from '@/components/ui/command';
import { useLanguage } from '@/lib/i18n';

export default function CommandPalette({ open, onOpenChange }) {
  const navigate = useNavigate();
  const { t } = useLanguage();

  const go = (path) => {
    onOpenChange(false);
    navigate(path);
  };

  return (
    <CommandDialog open={open} onOpenChange={onOpenChange}>
      <CommandInput placeholder={t('commandPalette.placeholder')} />
      <CommandList>
        <CommandEmpty>{t('commandPalette.noResults')}</CommandEmpty>
        <CommandGroup heading={t('commandPalette.navigate')}>
          <CommandItem onSelect={() => go('/')}><LayoutDashboard className="mr-2 h-4 w-4" /> {t('nav.dashboard')}</CommandItem>
          <CommandItem onSelect={() => go('/transactions')}><Receipt className="mr-2 h-4 w-4" /> {t('nav.transactions')}</CommandItem>
          <CommandItem onSelect={() => go('/recurring')}><Repeat className="mr-2 h-4 w-4" /> {t('nav.recurring')}</CommandItem>
          <CommandItem onSelect={() => go('/goals')}><Target className="mr-2 h-4 w-4" /> {t('nav.goals')}</CommandItem>
          <CommandItem onSelect={() => go('/goals?tab=debts')}><Target className="mr-2 h-4 w-4" /> {t('nav.debts')}</CommandItem>
          <CommandItem onSelect={() => go('/categories')}><FolderTree className="mr-2 h-4 w-4" /> {t('nav.categories')}</CommandItem>
          <CommandItem onSelect={() => go('/budgets')}><Wallet className="mr-2 h-4 w-4" /> {t('nav.budgets')}</CommandItem>
          <CommandItem onSelect={() => go('/reports')}><BarChart3 className="mr-2 h-4 w-4" /> {t('nav.reports')}</CommandItem>
          <CommandItem onSelect={() => go('/settings')}><SettingsIcon className="mr-2 h-4 w-4" /> {t('nav.settings')}</CommandItem>
        </CommandGroup>
        <CommandGroup heading={t('commandPalette.quickAdd')}>
          <CommandItem onSelect={() => go('/income/new')}><TrendingUp className="mr-2 h-4 w-4" /> {t('commandPalette.addIncome')}</CommandItem>
          <CommandItem onSelect={() => go('/expenses/new')}><TrendingDown className="mr-2 h-4 w-4" /> {t('commandPalette.addExpense')}</CommandItem>
          <CommandItem onSelect={() => go('/recurring')}><Plus className="mr-2 h-4 w-4" /> {t('commandPalette.addRecurringTemplate')}</CommandItem>
          <CommandItem onSelect={() => go('/goals')}><Plus className="mr-2 h-4 w-4" /> {t('commandPalette.addSavingsGoal')}</CommandItem>
        </CommandGroup>
      </CommandList>
    </CommandDialog>
  );
}
