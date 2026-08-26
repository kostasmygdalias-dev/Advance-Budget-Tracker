import { useEffect, useState } from 'react';

// Read-only: reflects whatever useDarkMode's toggle (in Layout's account
// menu) already set on <html class="dark">, via a MutationObserver rather
// than owning any state itself — safe to call from many small components
// (e.g. every category icon) without each instance re-writing localStorage.
function isDarkNow() {
  return document.documentElement.classList.contains('dark');
}

export function useIsDark() {
  const [isDark, setIsDark] = useState(isDarkNow);

  useEffect(() => {
    const observer = new MutationObserver(() => setIsDark(isDarkNow()));
    observer.observe(document.documentElement, { attributes: true, attributeFilter: ['class'] });
    return () => observer.disconnect();
  }, []);

  return isDark;
}
