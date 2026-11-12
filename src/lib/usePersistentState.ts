import { useEffect, useState } from 'react';
import { APP_CONFIG } from './config';

/** useState persistido em localStorage (preferências de UI por navegador). */
export function usePersistentState<T>(key: string, initial: T, isValid?: (v: unknown) => v is T): [T, (v: T | ((prev: T) => T)) => void] {
  const fullKey = `${APP_CONFIG.storagePrefix}:ui:${key}`;
  const [value, setValue] = useState<T>(() => {
    try {
      const raw = localStorage.getItem(fullKey);
      if (raw !== null) {
        const parsed: unknown = JSON.parse(raw);
        if (!isValid || isValid(parsed)) return parsed as T;
      }
    } catch {
      /* ignore */
    }
    return initial;
  });
  useEffect(() => {
    try {
      localStorage.setItem(fullKey, JSON.stringify(value));
    } catch {
      /* ignore */
    }
  }, [fullKey, value]);
  return [value, setValue];
}
