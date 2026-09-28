import { useState } from 'react';
import { addMonths, eachDayOfInterval, endOfMonth, endOfWeek, isSameDay, isSameMonth, startOfMonth, startOfWeek, subMonths } from 'date-fns';
import { ChevronLeft, ChevronRight } from 'lucide-react';
import { cn } from '@/lib/utils';
import { useLanguage } from '@/lib/i18n';

// A plain month grid — deliberately not react-day-picker, since date-fns is
// already a dependency and this only ever needs to do one thing. Month and
// weekday names come from Intl rather than a date-fns locale import, the
// same way finance.js does it, so the language switcher drives them with no
// extra bundle to keep in sync.
export function Calendar({ selected, onSelect }) {
  const { t, lang } = useLanguage();
  const [viewMonth, setViewMonth] = useState(startOfMonth(selected || new Date()));

  // Weeks start Monday, matching the weekly-budget period in Dashboard.jsx.
  const days = eachDayOfInterval({
    start: startOfWeek(startOfMonth(viewMonth), { weekStartsOn: 1 }),
    end: endOfWeek(endOfMonth(viewMonth), { weekStartsOn: 1 }),
  });

  const heading = new Intl.DateTimeFormat(lang, { month: 'long', year: 'numeric' }).format(viewMonth);
  const weekdayFmt = new Intl.DateTimeFormat(lang, { weekday: 'narrow' });
  const today = new Date();

  return (
    <div className="space-y-2">
      <div className="flex items-center justify-between gap-2">
        <button
          type="button"
          onClick={() => setViewMonth(subMonths(viewMonth, 1))}
          aria-label={t('dateInput.previousMonth')}
          className="p-1 rounded-md text-muted-foreground hover:bg-muted transition-colors"
        >
          <ChevronLeft className="w-4 h-4" />
        </button>
        <span className="text-sm font-medium capitalize">{heading}</span>
        <button
          type="button"
          onClick={() => setViewMonth(addMonths(viewMonth, 1))}
          aria-label={t('dateInput.nextMonth')}
          className="p-1 rounded-md text-muted-foreground hover:bg-muted transition-colors"
        >
          <ChevronRight className="w-4 h-4" />
        </button>
      </div>

      <div className="grid grid-cols-7 gap-0.5">
        {days.slice(0, 7).map((d) => (
          <div key={`h-${d.getTime()}`} className="h-7 flex items-center justify-center text-[11px] font-medium text-muted-foreground">
            {weekdayFmt.format(d)}
          </div>
        ))}
        {days.map((d) => {
          const isSelected = selected && isSameDay(d, selected);
          return (
            <button
              key={d.getTime()}
              type="button"
              onClick={() => onSelect(d)}
              className={cn(
                'h-8 w-8 rounded-md text-sm tabular-nums transition-colors',
                isSelected
                  ? 'bg-primary text-primary-foreground font-medium'
                  : 'hover:bg-muted',
                !isSameMonth(d, viewMonth) && !isSelected && 'text-muted-foreground/40',
                !isSelected && isSameDay(d, today) && 'font-semibold underline underline-offset-2'
              )}
            >
              {d.getDate()}
            </button>
          );
        })}
      </div>
    </div>
  );
}
