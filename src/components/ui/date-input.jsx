import { useEffect, useState } from 'react';
import { Input } from '@/components/ui/input';
import { useLanguage } from '@/lib/i18n';

// A day/month/year date field, always displayed and typed that way
// regardless of the visitor's own browser — native <input type="date">'s
// displayed format follows the BROWSER'S OWN locale setting (confirmed: the
// page's `lang` attribute has no effect on it in Chromium), so there's no
// reliable way to force it via the native input. Value in/out is still the
// plain "YYYY-MM-DD" string every other date field in the app uses
// (paid_date, received_date, next_due_date, ...) — only the on-screen
// typing/display format is DD/MM/YYYY; storage and comparisons elsewhere
// are untouched.
export function DateInput({ id, value, onChange, className }) {
  const { lang } = useLanguage();
  const [text, setText] = useState('');

  // Resync display text whenever the caller's value changes from outside
  // (e.g. loading a different record into an edit form) - but not on every
  // local keystroke, since we're still building up an in-progress date.
  useEffect(() => {
    if (value && /^\d{4}-\d{2}-\d{2}$/.test(value)) {
      const [y, m, d] = value.split('-');
      setText(`${d}/${m}/${y}`);
    } else if (!value) {
      setText('');
    }
  }, [value]);

  const handleChange = (e) => {
    const digits = e.target.value.replace(/\D/g, '').slice(0, 8); // DDMMYYYY
    let formatted = digits;
    if (digits.length > 4) formatted = `${digits.slice(0, 2)}/${digits.slice(2, 4)}/${digits.slice(4)}`;
    else if (digits.length > 2) formatted = `${digits.slice(0, 2)}/${digits.slice(2)}`;
    setText(formatted);
    if (digits.length === 8) {
      const day = digits.slice(0, 2);
      const month = digits.slice(2, 4);
      const year = digits.slice(4, 8);
      if (Number(day) >= 1 && Number(day) <= 31 && Number(month) >= 1 && Number(month) <= 12) {
        onChange(`${year}-${month}-${day}`);
      }
    } else if (digits.length === 0) {
      onChange('');
    }
  };

  return (
    <Input
      id={id}
      type="text"
      inputMode="numeric"
      autoComplete="off"
      placeholder={lang === 'el' ? 'ΗΗ/ΜΜ/ΕΕΕΕ' : 'DD/MM/YYYY'}
      maxLength={10}
      value={text}
      onChange={handleChange}
      className={className}
    />
  );
}
