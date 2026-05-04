// Theme store — light, dark, or follow the system. Persists through reloads
// in localStorage; on first load (and whenever 'system' is selected) it tracks
// `prefers-color-scheme` live.

import { create } from 'zustand';

export type Theme = 'light' | 'dark' | 'system';

const STORAGE_KEY = 'lacing.theme';

function readStored(): Theme {
  if (typeof window === 'undefined') return 'system';
  const v = window.localStorage.getItem(STORAGE_KEY);
  return v === 'light' || v === 'dark' || v === 'system' ? v : 'system';
}

function systemPrefersDark(): boolean {
  return typeof window !== 'undefined' && window.matchMedia('(prefers-color-scheme: dark)').matches;
}

function effective(theme: Theme): 'light' | 'dark' {
  if (theme === 'system') return systemPrefersDark() ? 'dark' : 'light';
  return theme;
}

function applyTheme(theme: Theme) {
  if (typeof document === 'undefined') return;
  document.documentElement.classList.toggle('dark', effective(theme) === 'dark');
}

interface ThemeState {
  theme: Theme;
  resolved: 'light' | 'dark';
  setTheme: (t: Theme) => void;
  /** Re-evaluate `resolved` based on the current `theme` and system preference. */
  refresh: () => void;
}

export const useThemeStore = create<ThemeState>((set, get) => {
  const initial = readStored();
  if (typeof window !== 'undefined') {
    applyTheme(initial);
    // Track system preference changes when the user picks 'system'.
    window
      .matchMedia('(prefers-color-scheme: dark)')
      .addEventListener('change', () => get().refresh());
  }
  return {
    theme: initial,
    resolved: effective(initial),
    setTheme: (theme) => {
      window.localStorage.setItem(STORAGE_KEY, theme);
      applyTheme(theme);
      set({ theme, resolved: effective(theme) });
    },
    refresh: () => {
      const t = get().theme;
      applyTheme(t);
      set({ resolved: effective(t) });
    },
  };
});
