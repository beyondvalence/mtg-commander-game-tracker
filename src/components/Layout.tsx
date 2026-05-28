import { useEffect, useMemo, useState } from 'react';
import { NavLink, Outlet } from 'react-router-dom';
import { applyTheme, resolveInitialTheme, THEME_STORAGE_KEY, type ThemeMode } from '../lib/theme';
import { PodTrackerLogo } from './PodTrackerLogo';
import { PlayerProfileDropdown } from './PlayerProfileDropdown';
import { PodSwitcher } from './PodSwitcher';

const links = [
  { to: '/', label: 'Home' },
  { to: '/add-game', label: 'Add Game' },
  { to: '/history', label: 'History' },
  { to: '/players', label: 'Pod' },
];

function AddGameNavLabel() {
  return (
    <span className='add-game-nav-label'>
      <span className='add-game-nav-plus' aria-hidden='true'>
        +
      </span>
      <span>Add Game</span>
    </span>
  );
}

function ThemeIcon({ theme }: { theme: ThemeMode }) {
  if (theme === 'dark') {
    return (
      <svg viewBox='0 0 24 24' className='h-5 w-5' fill='none' stroke='currentColor' strokeWidth='1.8' aria-hidden='true'>
        <path d='M21 12.8A9 9 0 1 1 11.2 3a7 7 0 0 0 9.8 9.8Z' />
      </svg>
    );
  }

  return (
    <svg viewBox='0 0 24 24' className='h-5 w-5' fill='none' stroke='currentColor' strokeWidth='1.8' aria-hidden='true'>
      <circle cx='12' cy='12' r='4.5' />
      <path d='M12 2.5v2.2M12 19.3v2.2M21.5 12h-2.2M4.7 12H2.5M18.7 5.3l-1.6 1.6M6.9 17.1l-1.6 1.6M18.7 18.7l-1.6-1.6M6.9 6.9 5.3 5.3' />
    </svg>
  );
}

export function Layout() {
  const [theme, setTheme] = useState<ThemeMode>('light');
  const [themeMenuOpen, setThemeMenuOpen] = useState(false);
  const [isReady, setIsReady] = useState(false);

  useEffect(() => {
    const initialTheme = resolveInitialTheme();
    setTheme(initialTheme);
    applyTheme(initialTheme);
    setIsReady(true);
  }, []);

  useEffect(() => {
    if (!isReady) {
      return;
    }

    applyTheme(theme);
    window.localStorage.setItem(THEME_STORAGE_KEY, theme);
  }, [isReady, theme]);

  useEffect(() => {
    function handlePointerDown(event: MouseEvent) {
      const target = event.target as HTMLElement | null;
      if (!target?.closest('[data-theme-menu-root]')) {
        setThemeMenuOpen(false);
      }
    }

    document.addEventListener('mousedown', handlePointerDown);
    return () => {
      document.removeEventListener('mousedown', handlePointerDown);
    };
  }, []);

  const themeLabel = useMemo(() => (theme === 'dark' ? 'Dark mode' : 'Light mode'), [theme]);

  return (
    <div className='mx-auto flex min-h-screen w-full max-w-[1550px] flex-col gap-4 px-4 py-4 md:px-6 md:py-6'>
      <header className='app-topbar' data-theme-menu-root>
        <div className='flex min-w-0 flex-1 flex-wrap items-center gap-3 md:gap-5'>
          <NavLink to='/' className='shrink-0'>
            <PodTrackerLogo />
          </NavLink>

          <nav className='flex min-w-0 flex-1 flex-wrap items-center gap-2'>
            {links.map((link) => (
              <NavLink
                key={link.to}
                to={link.to}
                className={({ isActive }) =>
                  `app-navlink ${link.to === '/add-game' ? 'app-navlink-add-game' : ''} ${isActive ? 'app-navlink-active' : ''}`
                }
              >
                {link.to === '/add-game' ? <AddGameNavLabel /> : <span>{link.label}</span>}
              </NavLink>
            ))}
            <PodSwitcher />
          </nav>
        </div>

        <div className='ml-auto flex items-center gap-2'>
          <PlayerProfileDropdown />
        </div>

        <div className='relative'>
          <button
            type='button'
            className='theme-toggle-button'
            aria-label={`Open theme selector. Current theme: ${themeLabel}`}
            aria-expanded={themeMenuOpen}
            onClick={() => setThemeMenuOpen((open) => !open)}
          >
            <ThemeIcon theme={theme} />
          </button>

          {themeMenuOpen && (
            <div className='absolute right-0 top-14 z-30 w-44 rounded-[1.5rem] border p-2 app-card'>
              <button
                type='button'
                className={`theme-option ${theme === 'light' ? 'theme-option-active' : ''}`}
                onClick={() => {
                  setTheme('light');
                  setThemeMenuOpen(false);
                }}
              >
                <span>Light</span>
                {theme === 'light' && <span>•</span>}
              </button>
              <button
                type='button'
                className={`theme-option ${theme === 'dark' ? 'theme-option-active' : ''}`}
                onClick={() => {
                  setTheme('dark');
                  setThemeMenuOpen(false);
                }}
              >
                <span>Dark</span>
                {theme === 'dark' && <span>•</span>}
              </button>
            </div>
          )}
        </div>
      </header>

      <main className='flex min-w-0 flex-1 flex-col gap-6'>
        <Outlet />
      </main>
    </div>
  );
}
