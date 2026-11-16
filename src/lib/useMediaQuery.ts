import { useSyncExternalStore } from 'react';

/** `true` enquanto a media query casar (ex.: `(max-width: 639px)` = celular). */
export function useMediaQuery(query: string): boolean {
  return useSyncExternalStore(
    (cb) => {
      const mq = window.matchMedia(query);
      mq.addEventListener('change', cb);
      return () => mq.removeEventListener('change', cb);
    },
    () => window.matchMedia(query).matches,
    () => false,
  );
}

/** Tela de celular (abaixo do breakpoint `sm` do Tailwind). */
export const useIsMobile = () => useMediaQuery('(max-width: 639px)');
