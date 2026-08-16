import { useNavigate } from 'react-router-dom';
import { LayoutDashboard, Receipt, Repeat, Settings as SettingsIcon, Plus, TrendingDown, TrendingUp, FolderTree } from 'lucide-react';
import {
  CommandDialog, CommandInput, CommandList, CommandEmpty, CommandGroup, CommandItem,
} from '@/components/ui/command';

export default function CommandPalette({ open, onOpenChange }) {
  const navigate = useNavigate();

  const go = (path) => {
    onOpenChange(false);
    navigate(path);
  };

  return (
    <CommandDialog open={open} onOpenChange={onOpenChange}>
      <CommandInput placeholder="Jump to a page or add a transaction…" />
      <CommandList>
        <CommandEmpty>No results.</CommandEmpty>
        <CommandGroup heading="Navigate">
          <CommandItem onSelect={() => go('/')}><LayoutDashboard className="mr-2 h-4 w-4" /> Dashboard</CommandItem>
          <CommandItem onSelect={() => go('/transactions')}><Receipt className="mr-2 h-4 w-4" /> Transactions</CommandItem>
          <CommandItem onSelect={() => go('/recurring')}><Repeat className="mr-2 h-4 w-4" /> Recurring</CommandItem>
          <CommandItem onSelect={() => go('/categories')}><FolderTree className="mr-2 h-4 w-4" /> Categories</CommandItem>
          <CommandItem onSelect={() => go('/settings')}><SettingsIcon className="mr-2 h-4 w-4" /> Settings</CommandItem>
        </CommandGroup>
        <CommandGroup heading="Quick add">
          <CommandItem onSelect={() => go('/income/new')}><TrendingUp className="mr-2 h-4 w-4" /> Add income</CommandItem>
          <CommandItem onSelect={() => go('/expenses/new')}><TrendingDown className="mr-2 h-4 w-4" /> Add expense</CommandItem>
          <CommandItem onSelect={() => go('/recurring')}><Plus className="mr-2 h-4 w-4" /> Add recurring template</CommandItem>
        </CommandGroup>
      </CommandList>
    </CommandDialog>
  );
}
