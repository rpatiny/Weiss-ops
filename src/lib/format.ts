import { APP_CONFIG } from './config';
import { parseISODate } from './dates';

const currencyFmt = new Intl.NumberFormat(APP_CONFIG.locale, {
  style: 'currency',
  currency: APP_CONFIG.currency,
});
const compactCurrencyFmt = new Intl.NumberFormat(APP_CONFIG.locale, {
  style: 'currency',
  currency: APP_CONFIG.currency,
  notation: 'compact',
  maximumFractionDigits: 1,
});
const numberFmt = new Intl.NumberFormat(APP_CONFIG.locale);

export const formatCurrency = (v: number) => currencyFmt.format(Number.isFinite(v) ? v : 0);
export const formatCurrencyCompact = (v: number) => compactCurrencyFmt.format(Number.isFinite(v) ? v : 0);
export const formatNumber = (v: number) => numberFmt.format(v);
export const formatPercent = (v: number, digits = 0) => `${v.toFixed(digits).replace('.', ',')}%`;

/** `2026-11-12` → `12/11/2026` */
export function formatDate(iso: string | undefined): string {
  if (!iso) return '—';
  const d = parseISODate(iso);
  return d.toLocaleDateString(APP_CONFIG.locale);
}

/** `2026-11-12` → `qui., 12 nov.` */
export function formatDateShort(iso: string): string {
  const s = parseISODate(iso).toLocaleDateString(APP_CONFIG.locale, {
    weekday: 'short',
    day: '2-digit',
    month: 'short',
  });
  return s.charAt(0).toUpperCase() + s.slice(1);
}

/** Iniciais para avatar. */
export function initials(name: string): string {
  const parts = name.trim().split(/\s+/);
  const first = parts[0]?.[0] ?? '';
  const last = parts.length > 1 ? (parts[parts.length - 1]?.[0] ?? '') : '';
  return (first + last).toUpperCase();
}
