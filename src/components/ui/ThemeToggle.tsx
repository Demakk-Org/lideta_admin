'use client';

import { useEffect, useState } from 'react';
import { MoonIcon, SunIcon } from '@heroicons/react/24/outline';
import { THEME_STORAGE_KEY, type Theme } from '@/lib/theme';

function applyTheme(theme: Theme) {
  document.documentElement.dataset.theme = theme;
  try {
    localStorage.setItem(THEME_STORAGE_KEY, theme);
  } catch {
    // Private-mode storage failures shouldn't break the toggle.
  }
}

export default function ThemeToggle() {
  // Undefined until mounted: the server can't know the stored theme, so the
  // label/icon only render once we've read <html data-theme>.
  const [theme, setTheme] = useState<Theme | undefined>(undefined);

  useEffect(() => {
    setTheme(document.documentElement.dataset.theme === 'dark' ? 'dark' : 'light');
  }, []);

  const toggle = () => {
    const next: Theme = theme === 'dark' ? 'light' : 'dark';
    applyTheme(next);
    setTheme(next);
  };

  const isDark = theme === 'dark';

  return (
    <button
      type='button'
      onClick={toggle}
      aria-label={isDark ? 'Switch to light mode' : 'Switch to dark mode'}
      className='group flex w-full cursor-pointer items-center rounded-md px-2 py-2 text-sm text-primary-700 transition-colors hover:bg-primary-100 hover:text-primary-800'
    >
      {isDark ? (
        <SunIcon
          className='h-6 w-6 flex-shrink-0 text-primary-400 group-hover:text-primary-600'
          aria-hidden='true'
        />
      ) : (
        <MoonIcon
          className='h-6 w-6 flex-shrink-0 text-primary-400 group-hover:text-primary-600'
          aria-hidden='true'
        />
      )}
      <span className='ml-3 font-medium'>
        {theme === undefined ? 'Theme' : isDark ? 'Light mode' : 'Dark mode'}
      </span>
    </button>
  );
}
