import { createContext, useContext, useEffect } from 'react';
import { useLocalStorage } from './useLocalStorage';

const ThemeContext = createContext();

export function ThemeProvider({ children }) {
  const [theme, setTheme] = useLocalStorage('fueltracker-theme', 'system');

  // Update theme-color meta tag for PWA and iOS status bar
  const updateThemeColorMeta = (isDark) => {
    const metaThemeColor = document.getElementById('theme-color-meta');
    if (metaThemeColor) {
      // Use actual CSS background colors: slate-50 (#f8fafc) for light, black (#000000) for dark
      metaThemeColor.setAttribute('content', isDark ? '#000000' : '#f8fafc');
    }
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

  return (
    <ThemeContext.Provider value={{ theme, setTheme }}>
      {children}
    </ThemeContext.Provider>
  );
}

// eslint-disable-next-line react-refresh/only-export-components
export function useTheme() {
  return useContext(ThemeContext);
}
