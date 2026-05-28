export const THEME_STORAGE_KEY = 'mtg-commander-theme';

export type ThemeMode = 'light' | 'dark';

export function applyTheme(theme: ThemeMode) {
  document.documentElement.setAttribute('data-theme', theme);
}

export function resolveInitialTheme(): ThemeMode {
  const savedTheme = window.localStorage.getItem(THEME_STORAGE_KEY);
  if (savedTheme === 'light' || savedTheme === 'dark') {
    return savedTheme;
  }

  return 'dark';
}
