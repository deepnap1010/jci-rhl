// client/src/lib/theme.ts
// Dark / light theme — a pure client-side preference (localStorage).
// Applied by toggling [data-theme="dark"] on <html>, which flips the CSS
// variables defined in index.css. No backend involvement.
import { useEffect, useState } from 'react';

export type Theme = 'light' | 'dark';
const KEY = 'jci_theme';

export function getTheme(): Theme {
  const saved = localStorage.getItem(KEY);
  if (saved === 'dark' || saved === 'light') return saved;
  // default: follow the OS preference the first time
  return window.matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light';
}

export function applyTheme(theme: Theme = getTheme()): void {
  const root = document.documentElement;
  if (theme === 'dark') root.setAttribute('data-theme', 'dark');
  else root.removeAttribute('data-theme');
}

// React hook: returns the current theme + a setter and a toggle.
export function useTheme() {
  const [theme, setThemeState] = useState<Theme>(getTheme);

  useEffect(() => { applyTheme(theme); }, [theme]);

  const setTheme = (next: Theme) => {
    localStorage.setItem(KEY, next);
    setThemeState(next);
  };
  const toggle = () => setTheme(theme === 'dark' ? 'light' : 'dark');

  return { theme, setTheme, toggle };
}