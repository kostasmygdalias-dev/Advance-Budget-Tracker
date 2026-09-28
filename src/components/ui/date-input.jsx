import { useEffect, useRef, useState } from 'react';
import { CalendarDays } from 'lucide-react';
import { Popover, PopoverTrigger, PopoverContent } from '@/components/ui/popover';
import { Calendar } from '@/components/ui/calendar';
import { cn } from '@/lib/utils';
import { parseDateLocal } from '@/lib/finance';
import { useLanguage } from '@/lib/i18n';

// A day/month/year date field, always displayed and typed that way
// regardless of the visitor's own browser — native <input type="date">'s
// displayed format follows the BROWSER'S OWN locale setting (confirmed: the
// page's `lang` attribute has no effect on it in Chromium), so there's no
// reliable way to force it via the native input. Value in/out is still the
// plain "YYYY-MM-DD" string every other date field in the app uses
// (paid_date, received_date, next_due_date, ...) — only the on-screen
// typing/display format is DD/MM/YYYY.
//
// Each part is its own input rather than one masked text box: a single box
// has to re-derive the whole date from its digits on every keystroke, so
// correcting just the day meant retyping the month and year behind it.
// Three inputs also give a phone a numeric keypad per part and make
// arrow-key stepping trivial.

const SEGMENTS = ['day', 'month', 'year'];
const LENGTHS = { day: 2, month: 2, year: 4 };
const RANGES = { day: [1, 31], month: [1, 12], year: [1900, 2999] };
// A first digit above this can't start a two-digit value, so the part is
// already complete and focus can move on (typing "8" for the day means the
// 8th, not the start of the 80-somethingth).
const FIRST_DIGIT_MAX = { day: 3, month: 1 };

const pad = (n, len) => String(n).padStart(len, '0');
const isIso = (v) => typeof v === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(v);
const toIso = (d) => `${d.getFullYear()}-${pad(d.getMonth() + 1, 2)}-${pad(d.getDate(), 2)}`;
const daysInMonth = (year, month) => new Date(year, month, 0).getDate();

export function DateInput({ id, value, onChange, className }) {
  const { t, lang } = useLanguage();
  const [parts, setParts] = useState({ day: '', month: '', year: '' });
  const [open, setOpen] = useState(false);
  // Auto-advancing to the next part blurs the current one in the same event,
  // before React has re-rendered — so handlers read the parts from here
  // rather than from a render-scoped copy that may already be a keystroke
  // behind.
  const partsRef = useRef(parts);
  // What this field last reported upward. The value comes straight back as
  // a prop, zero-padded — without this, typing "2" into the day would echo
  // back as "02" mid-keystroke and the next digit would land on that
  // instead ("025" -> "02").
  const lastEmittedRef = useRef(null);
  const dayRef = useRef(null);
  const monthRef = useRef(null);
  const yearRef = useRef(null);
  const refs = { day: dayRef, month: monthRef, year: yearRef };

  const applyParts = (next) => {
    partsRef.current = next;
    setParts(next);
  };

  // Resync whenever the caller's value changes from outside (e.g. loading a
  // different record into an edit form).
  useEffect(() => {
    if (value === lastEmittedRef.current) return;
    if (isIso(value)) {
      const [y, m, d] = value.split('-');
      applyParts({ day: d, month: m, year: y });
    } else if (!value) {
      applyParts({ day: '', month: '', year: '' });
    }
  }, [value]);

  // Applies a change to the parts and, once they spell a real date, reports
  // it upward. A day past the end of the chosen month is pulled back to the
  // last one (picking the 31st then switching to February gives the 28th)
  // rather than leaving a field that looks filled in but reports nothing.
  const commit = (next) => {
    let { day } = next;
    const { month, year } = next;
    const y = Number(year);
    const m = Number(month);

    if (day && month && year.length === 4 && m >= 1 && m <= 12 && y >= RANGES.year[0]) {
      const max = daysInMonth(y, m);
      if (Number(day) > max) day = pad(max, 2);
    }

    const settled = { ...next, day };
    applyParts(settled);

    if (!settled.day && !settled.month && !settled.year) {
      lastEmittedRef.current = '';
      onChange('');
      return;
    }
    const d = Number(settled.day);
    if (settled.day && settled.month && settled.year.length === 4
      && m >= 1 && m <= 12 && y >= RANGES.year[0] && d >= 1 && d <= daysInMonth(y, m)) {
      const iso = `${settled.year}-${pad(m, 2)}-${pad(d, 2)}`;
      lastEmittedRef.current = iso;
      onChange(iso);
    }
  };

  const focusSegment = (name) => {
    const el = refs[name]?.current;
    if (!el) return;
    el.focus();
    el.select();
  };

  const shiftFocus = (name, delta) => {
    const next = SEGMENTS[SEGMENTS.indexOf(name) + delta];
    if (next) focusSegment(next);
  };

  const handleChange = (name, raw) => {
    let digits = raw.replace(/\D/g, '').slice(0, LENGTHS[name]);
    const firstDigitMax = FIRST_DIGIT_MAX[name];
    const complete = firstDigitMax !== undefined && digits.length === 1 && Number(digits) > firstDigitMax;
    if (complete) digits = pad(digits, 2);

    commit({ ...partsRef.current, [name]: digits });
    if (digits.length === LENGTHS[name]) shiftFocus(name, 1);
  };

  const step = (name, delta) => {
    const [min, max] = RANGES[name];
    const current = partsRef.current[name];
    let next;
    if (!current) {
      next = name === 'year' ? new Date().getFullYear() : (delta > 0 ? min : max);
    } else {
      next = Number(current) + delta;
      // Day and month wrap around; a year is clamped instead, since jumping
      // from 1900 to 2999 is never what nudging the field is meant to do.
      if (next > max) next = name === 'year' ? max : min;
      if (next < min) next = name === 'year' ? min : max;
    }
    commit({ ...partsRef.current, [name]: pad(next, LENGTHS[name]) });
  };

  const handleKeyDown = (name, e) => {
    const el = e.currentTarget;
    if (e.key === 'ArrowUp' || e.key === 'ArrowDown') {
      e.preventDefault();
      step(name, e.key === 'ArrowUp' ? 1 : -1);
    } else if (e.key === 'ArrowLeft' && el.selectionStart === 0) {
      e.preventDefault();
      shiftFocus(name, -1);
    } else if (e.key === 'ArrowRight' && el.selectionEnd === el.value.length) {
      e.preventDefault();
      shiftFocus(name, 1);
    } else if (e.key === 'Backspace' && el.value === '') {
      e.preventDefault();
      shiftFocus(name, -1);
    }
  };

  // A lone "8" in the day is only padded to "08" once focus leaves, so
  // someone on their way to typing "18" isn't cut off after the first digit.
  // A half-typed year is left alone instead — "26" padded to "0026" would
  // look broken, and an incomplete year just doesn't make a date yet.
  const handleBlur = (name) => {
    const current = partsRef.current[name];
    if (name === 'year' || !current || current.length === LENGTHS[name]) return;
    commit({ ...partsRef.current, [name]: pad(current, LENGTHS[name]) });
  };

  const placeholders = lang === 'el'
    ? { day: 'ΗΗ', month: 'ΜΜ', year: 'ΕΕΕΕ' }
    : { day: 'DD', month: 'MM', year: 'YYYY' };

  const segment = (name) => (
    <input
      ref={refs[name]}
      id={name === 'day' ? id : undefined}
      type="text"
      inputMode="numeric"
      autoComplete="off"
      aria-label={t(`dateInput.${name}`)}
      placeholder={placeholders[name]}
      value={parts[name]}
      onChange={(e) => handleChange(name, e.target.value)}
      onKeyDown={(e) => handleKeyDown(name, e)}
      onFocus={(e) => e.target.select()}
      onClick={(e) => e.target.select()}
      onBlur={() => handleBlur(name)}
      className={cn(
        'bg-transparent text-center tabular-nums outline-none placeholder:text-muted-foreground',
        name === 'year' ? 'w-[4.5ch]' : 'w-[2.5ch]'
      )}
    />
  );

  return (
    <div
      className={cn(
        'flex h-9 w-full items-center rounded-md border border-input bg-transparent px-3 py-1 text-base shadow-sm transition-colors focus-within:ring-1 focus-within:ring-ring md:text-sm',
        className
      )}
    >
      {segment('day')}
      <span className="text-muted-foreground">/</span>
      {segment('month')}
      <span className="text-muted-foreground">/</span>
      {segment('year')}

      <Popover open={open} onOpenChange={setOpen}>
        <PopoverTrigger asChild>
          <button
            type="button"
            aria-label={t('dateInput.openCalendar')}
            className="ml-auto pl-2 text-muted-foreground hover:text-foreground transition-colors"
          >
            <CalendarDays className="w-4 h-4" />
          </button>
        </PopoverTrigger>
        <PopoverContent className="w-auto p-3" align="start">
          <Calendar
            selected={isIso(value) ? parseDateLocal(value) : null}
            onSelect={(d) => { onChange(toIso(d)); setOpen(false); }}
          />
        </PopoverContent>
      </Popover>
    </div>
  );
}
