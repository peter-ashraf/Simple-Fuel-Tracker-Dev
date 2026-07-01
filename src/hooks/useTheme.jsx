import { createContext, useContext, useEffect } from 'react';
import { useLocalStorage } from './useLocalStorage';

const ThemeContext = createContext();
const DARK_STATUS_BAR_COLOR = '#02070d';
const LIGHT_STATUS_BAR_COLOR = '#f8fafc';
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

export function ThemeProvider({ children }) {
  const [theme, setTheme] = useLocalStorage('fueltracker-theme', 'system');
  const [textSize, setTextSize] = useLocalStorage('fueltracker-text-size', 'default');

  // Update theme-color meta tag for PWA and iOS status bar
  const updateThemeColorMeta = (isDark) => {
    const activeColor = isDark ? DARK_STATUS_BAR_COLOR : LIGHT_STATUS_BAR_COLOR;

    ensureMetaTag('meta[name="theme-color"]:not([media])', {
      name: 'theme-color',
      id: 'theme-color-meta',
      content: activeColor,
    });
    ensureMetaTag('meta[name="theme-color"][media="(prefers-color-scheme: light)"]', {
      name: 'theme-color',
      id: 'theme-color-meta-light',
      media: '(prefers-color-scheme: light)',
      content: LIGHT_STATUS_BAR_COLOR,
    });
    ensureMetaTag('meta[name="theme-color"][media="(prefers-color-scheme: dark)"]', {
      name: 'theme-color',
      id: 'theme-color-meta-dark',
      media: '(prefers-color-scheme: dark)',
      content: DARK_STATUS_BAR_COLOR,
    });
    ensureMetaTag('meta[name="apple-mobile-web-app-status-bar-style"]', {
      name: 'apple-mobile-web-app-status-bar-style',
      content: isDark ? 'black-translucent' : 'default',
    });

    document.documentElement.style.colorScheme = isDark ? 'dark' : 'light';
    document.documentElement.style.backgroundColor = activeColor;
    document.body.style.backgroundColor = activeColor;
  };

  useEffect(() => {
    const root = window.document.documentElement;
    root.classList.remove('light', 'dark');

    const isDark = theme === 'dark' || (theme === 'system' && window.matchMedia('(prefers-color-scheme: dark)').matches);
    root.classList.add(isDark ? 'dark' : 'light');
    
    // Update theme-color for iOS status bar and PWA
    updateThemeColorMeta(isDark);
  }, [theme]);

  useEffect(() => {
    if (theme !== 'system') return;
    
    const mediaQuery = window.matchMedia('(prefers-color-scheme: dark)');
    const handleChange = (e) => {
      const root = window.document.documentElement;
      root.classList.remove('light', 'dark');
      root.classList.add(e.matches ? 'dark' : 'light');
      // Update theme-color when system theme changes
      updateThemeColorMeta(e.matches);
    };
    
    mediaQuery.addEventListener('change', handleChange);
    return () => mediaQuery.removeEventListener('change', handleChange);
  }, [theme]);

  useEffect(() => {
    const root = window.document.documentElement;
    const normalizedTextSize = Object.prototype.hasOwnProperty.call(TEXT_SIZE_OPTIONS, textSize)
      ? textSize
      : 'default';

    root.dataset.textSize = normalizedTextSize;
    root.style.setProperty('--app-text-scale', TEXT_SIZE_OPTIONS[normalizedTextSize]);
  }, [textSize]);

  return (
    <ThemeContext.Provider value={{ theme, setTheme, textSize, setTextSize }}>
      {children}
    </ThemeContext.Provider>
  );
}

// eslint-disable-next-line react-refresh/only-export-components
export function useTheme() {
  return useContext(ThemeContext);
}
