import { createContext, useCallback, useContext, useEffect, useMemo, useState } from 'react';
import { useLocalStorage } from './useLocalStorage';

const ThemeContext = createContext();
const DARK_STATUS_BAR_COLOR = '#02070d';
const LIGHT_STATUS_BAR_COLOR = '#f8fafc';
const THEME_OPTIONS = new Set(['light', 'dark', 'system']);
const TEXT_SIZE_OPTIONS = {
  compact: 0.94,
  default: 1,
  large: 1.08,
};

const ensureMetaTag = (selector, attributes) => {
  let element = document.querySelector(selector);
  if (!element) {
    element = document.createElement('meta');
    document.head.appendChild(element);
  }

  Object.entries(attributes).forEach(([key, value]) => {
    element.setAttribute(key, value);
  });

  return element;
};

const normalizeTheme = (value) => (THEME_OPTIONS.has(value) ? value : 'system');

const getSystemPrefersDark = () => (
  typeof window !== 'undefined'
  && typeof window.matchMedia === 'function'
  && window.matchMedia('(prefers-color-scheme: dark)').matches
);

const getResolvedTheme = (theme) => {
  const normalizedTheme = normalizeTheme(theme);
  if (normalizedTheme === 'system') {
    return getSystemPrefersDark() ? 'dark' : 'light';
  }
  return normalizedTheme;
};

const applyResolvedTheme = (resolvedTheme, selectedTheme) => {
  if (typeof document === 'undefined') return;

  const root = document.documentElement;
  const isDark = resolvedTheme === 'dark';
  const activeColor = isDark ? DARK_STATUS_BAR_COLOR : LIGHT_STATUS_BAR_COLOR;
  const lightMediaColor = selectedTheme === 'system' ? LIGHT_STATUS_BAR_COLOR : activeColor;
  const darkMediaColor = selectedTheme === 'system' ? DARK_STATUS_BAR_COLOR : activeColor;

  root.classList.remove('light', 'dark');
  root.classList.add(resolvedTheme);
  root.dataset.theme = selectedTheme;
  root.dataset.resolvedTheme = resolvedTheme;

  ensureMetaTag('meta[name="theme-color"]:not([media])', {
    name: 'theme-color',
    id: 'theme-color-meta',
    content: activeColor,
  });
  ensureMetaTag('meta[name="theme-color"][media="(prefers-color-scheme: light)"]', {
    name: 'theme-color',
    id: 'theme-color-meta-light',
    media: '(prefers-color-scheme: light)',
    content: lightMediaColor,
  });
  ensureMetaTag('meta[name="theme-color"][media="(prefers-color-scheme: dark)"]', {
    name: 'theme-color',
    id: 'theme-color-meta-dark',
    media: '(prefers-color-scheme: dark)',
    content: darkMediaColor,
  });
  ensureMetaTag('meta[name="apple-mobile-web-app-status-bar-style"]', {
    name: 'apple-mobile-web-app-status-bar-style',
    content: isDark ? 'black-translucent' : 'default',
  });
  ensureMetaTag('meta[name="msapplication-navbutton-color"]', {
    name: 'msapplication-navbutton-color',
    content: activeColor,
  });

  root.style.colorScheme = resolvedTheme;
  root.style.backgroundColor = activeColor;
  document.body.style.backgroundColor = activeColor;
};

const addMediaQueryChangeListener = (mediaQuery, listener) => {
  if (typeof mediaQuery.addEventListener === 'function') {
    mediaQuery.addEventListener('change', listener);
    return () => mediaQuery.removeEventListener('change', listener);
  }

  if (typeof mediaQuery.addListener === 'function') {
    mediaQuery.addListener(listener);
    return () => mediaQuery.removeListener(listener);
  }

  return () => {};
};

export function ThemeProvider({ children }) {
  const [theme, setStoredTheme] = useLocalStorage('fueltracker-theme', 'system');
  const [textSize, setTextSize] = useLocalStorage('fueltracker-text-size', 'default');
  const normalizedTheme = normalizeTheme(theme);
  const [resolvedTheme, setResolvedTheme] = useState(() => getResolvedTheme(normalizedTheme));

  const setTheme = useCallback((nextTheme) => {
    setStoredTheme(normalizeTheme(nextTheme));
  }, [setStoredTheme]);

  useEffect(() => {
    if (theme !== normalizedTheme) {
      setStoredTheme(normalizedTheme);
    }
  }, [normalizedTheme, setStoredTheme, theme]);

  useEffect(() => {
    if (typeof window === 'undefined') return undefined;

    const syncTheme = () => {
      const nextResolvedTheme = getResolvedTheme(normalizedTheme);
      setResolvedTheme(nextResolvedTheme);
      applyResolvedTheme(nextResolvedTheme, normalizedTheme);
    };

    syncTheme();

    const mediaQuery = window.matchMedia('(prefers-color-scheme: dark)');
    let removeMediaQueryListener = () => {};
    if (normalizedTheme === 'system') {
      removeMediaQueryListener = addMediaQueryChangeListener(mediaQuery, syncTheme);
    }
    document.addEventListener('visibilitychange', syncTheme);
    window.addEventListener('pageshow', syncTheme);

    return () => {
      removeMediaQueryListener();
      document.removeEventListener('visibilitychange', syncTheme);
      window.removeEventListener('pageshow', syncTheme);
    };
  }, [normalizedTheme]);

  useEffect(() => {
    const root = window.document.documentElement;
    const normalizedTextSize = Object.prototype.hasOwnProperty.call(TEXT_SIZE_OPTIONS, textSize)
      ? textSize
      : 'default';

    root.dataset.textSize = normalizedTextSize;
    root.style.setProperty('--app-text-scale', TEXT_SIZE_OPTIONS[normalizedTextSize]);
  }, [textSize]);

  const value = useMemo(() => ({
    theme: normalizedTheme,
    setTheme,
    resolvedTheme,
    textSize,
    setTextSize,
  }), [normalizedTheme, resolvedTheme, setTheme, setTextSize, textSize]);

  return (
    <ThemeContext.Provider value={value}>
      {children}
    </ThemeContext.Provider>
  );
}

// eslint-disable-next-line react-refresh/only-export-components
export function useTheme() {
  return useContext(ThemeContext);
}
