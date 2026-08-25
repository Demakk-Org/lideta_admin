export type Theme = 'light' | 'dark';

export const THEME_STORAGE_KEY = 'lideta-admin-theme';

/**
 * Runs before paint (inlined in the root layout) so the stored theme is applied
 * to <html> before React hydrates and the page never flashes the wrong colors.
 * Falls back to the OS preference when nothing has been chosen yet.
 */
export const themeInitScript = `(function(){try{var t=localStorage.getItem('${THEME_STORAGE_KEY}');if(t!=='light'&&t!=='dark'){t=window.matchMedia('(prefers-color-scheme: dark)').matches?'dark':'light';}document.documentElement.dataset.theme=t;}catch(e){}})();`;
