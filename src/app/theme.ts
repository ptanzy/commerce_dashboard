import { useEffect, useState } from 'react';

export type DashboardTheme = 'dark' | 'light';
export const THEME_STORAGE_KEY = 'commerce-dashboard-theme';

export function readTheme(): DashboardTheme {
  if (typeof window === 'undefined') return 'dark';
  try { return window.localStorage.getItem(THEME_STORAGE_KEY) === 'light' ? 'light' : 'dark'; }
  catch { return 'dark'; }
}

export function useTheme(): { theme: DashboardTheme; toggleTheme: () => void } {
  const [theme, setTheme] = useState<DashboardTheme>(readTheme);
  useEffect(() => {
    document.documentElement.dataset.theme = theme;
    try { window.localStorage.setItem(THEME_STORAGE_KEY, theme); } catch { /* storage disabled */ }
  }, [theme]);
  return { theme, toggleTheme: () => setTheme((old) => old === 'dark' ? 'light' : 'dark') };
}
