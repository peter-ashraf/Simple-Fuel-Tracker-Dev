import { useEffect, useRef, useState } from 'react';

const LOCAL_STORAGE_REFRESH_EVENT = 'fueltracker-local-storage-refresh';

export function useLocalStorage(key, initialValue) {
  const initialValueRef = useRef(initialValue);
  const [storedValue, setStoredValue] = useState(() => {
    try {
      const item = window.localStorage.getItem(key);
      return item ? JSON.parse(item) : initialValue;
    } catch (error) {
      console.error(error);
      return initialValue;
    }
  });

  useEffect(() => {
    const readStoredValue = () => {
      try {
        const item = window.localStorage.getItem(key);
        setStoredValue(item ? JSON.parse(item) : initialValueRef.current);
      } catch (error) {
        console.error(error);
        setStoredValue(initialValueRef.current);
      }
    };

    const handleStorage = (event) => {
      if (!event.key || event.key === key) readStoredValue();
    };

    window.addEventListener('storage', handleStorage);
    window.addEventListener(LOCAL_STORAGE_REFRESH_EVENT, readStoredValue);

    return () => {
      window.removeEventListener('storage', handleStorage);
      window.removeEventListener(LOCAL_STORAGE_REFRESH_EVENT, readStoredValue);
    };
  }, [key]);

  const setValue = (value) => {
    try {
      const valueToStore = value instanceof Function ? value(storedValue) : value;
      setStoredValue(valueToStore);
      window.localStorage.setItem(key, JSON.stringify(valueToStore));
    } catch (error) {
      console.error(error);
    }
  };

  return [storedValue, setValue];
}

export function refreshLocalStorageState() {
  window.dispatchEvent(new Event(LOCAL_STORAGE_REFRESH_EVENT));
}
