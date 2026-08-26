import { useState } from 'react';
import { Button } from '@/components/ui/button';
import { Popover, PopoverTrigger, PopoverContent } from '@/components/ui/popover';
import { Checkbox } from '@/components/ui/checkbox';
import { ChevronDown, X } from 'lucide-react';

// A checkbox popover for picking zero or more categories/subcategories at
// once, with a trigger label that summarizes the selection — used anywhere
// a plain <select> would only let you focus on one category at a time (the
// Reports spending drill-down, the Transactions list filter), since a
// native <select> can't represent multiple checked options with a readable
// trigger. `entries` is a flat list of { id, name, depth } (depth > 0 renders
// indented as a subcategory).
export default function CategoryMultiSelect({
  entries, selectedIds, onToggle, onClear, allLabel, selectedLabel, clearLabel, triggerClassName,
}) {
  const [open, setOpen] = useState(false);
  const selectedEntries = entries.filter((e) => selectedIds.includes(e.id));
  const label = selectedIds.length === 0
    ? allLabel
    : selectedIds.length === 1
      ? selectedEntries[0]?.name
      : selectedLabel(selectedIds.length);
  return (
    <div className="flex items-center gap-1">
      <Popover open={open} onOpenChange={setOpen}>
        <PopoverTrigger asChild>
          <Button variant="outline" size="sm" className={triggerClassName || 'h-8 text-xs w-48 justify-between font-normal'}>
            <span className="truncate">{label}</span>
            <ChevronDown className="w-3.5 h-3.5 shrink-0 opacity-60" />
          </Button>
        </PopoverTrigger>
        <PopoverContent className="w-64 p-1" align="start">
          <div className="max-h-72 overflow-y-auto space-y-0.5">
            <button
              type="button"
              onClick={() => { onClear(); setOpen(false); }}
              className={`w-full flex items-center rounded-md px-2 py-1.5 text-sm hover:bg-muted transition-colors ${selectedIds.length === 0 ? 'font-medium' : ''}`}
            >
              {allLabel}
            </button>
            {entries.map((c) => (
              <label
                key={c.id}
                className={`w-full flex items-center gap-2 rounded-md px-2 py-1.5 text-sm hover:bg-muted transition-colors cursor-pointer ${c.depth > 0 ? 'pl-6 text-muted-foreground' : ''}`}
              >
                <Checkbox checked={selectedIds.includes(c.id)} onCheckedChange={() => onToggle(c.id)} />
                <span className="truncate">{c.depth > 0 ? '↳ ' : ''}{c.name}</span>
              </label>
            ))}
          </div>
        </PopoverContent>
      </Popover>
      {selectedIds.length > 0 && (
        <Button
          variant="ghost" size="icon" className="h-8 w-8 shrink-0"
          onClick={onClear} aria-label={clearLabel} title={clearLabel}
        >
          <X className="w-4 h-4" />
        </Button>
      )}
    </div>
  );
}
