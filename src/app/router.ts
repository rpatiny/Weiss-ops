import { useSyncExternalStore } from 'react';

/**
 * Roteador mínimo baseado em hash (`#/rota?param=valor`).
 * Funciona em qualquer hospedagem estática e permite deep-links para registros
 * (ex.: `#/purchase-orders?open=po_123`), base da navegação cruzada entre módulos.
 */
export type RoutePath = '/calendar' | '/employees' | '/purchase-orders' | '/financial' | '/settings';

export const DEFAULT_ROUTE: RoutePath = '/calendar';
const VALID: RoutePath[] = ['/calendar', '/employees', '/purchase-orders', '/financial', '/settings'];

export interface Route {
  path: RoutePath;
  params: URLSearchParams;
}

function subscribe(cb: () => void) {
  window.addEventListener('hashchange', cb);
  return () => window.removeEventListener('hashchange', cb);
}
const getHash = () => window.location.hash;

export function parseHash(hash: string): Route {
  const raw = hash.replace(/^#/, '') || DEFAULT_ROUTE;
  const [p = '', q = ''] = raw.split('?');
  const path = (VALID as string[]).includes(p) ? (p as RoutePath) : DEFAULT_ROUTE;
  return { path, params: new URLSearchParams(q) };
}

export function useRoute(): Route {
  const hash = useSyncExternalStore(subscribe, getHash, getHash);
  return parseHash(hash);
}

export function navigate(path: RoutePath, params?: Record<string, string | undefined>): void {
  const qs = new URLSearchParams();
  Object.entries(params ?? {}).forEach(([k, v]) => v !== undefined && qs.set(k, v));
  const q = qs.toString();
  window.location.hash = q ? `${path}?${q}` : path;
}

/** Remove parâmetros da URL atual sem criar entrada no histórico. */
export function clearParams(...keys: string[]): void {
  const { path, params } = parseHash(window.location.hash);
  keys.forEach((k) => params.delete(k));
  const q = params.toString();
  history.replaceState(null, '', `#${q ? `${path}?${q}` : path}`);
  window.dispatchEvent(new HashChangeEvent('hashchange'));
}
