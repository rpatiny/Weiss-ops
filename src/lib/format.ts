import { APP_CONFIG } from './config';
import { parseISODate } from './dates';

/**
 * Formatação sensível ao idioma ativo. O I18nProvider chama `setFormatLocale`
 * ao trocar de idioma; a moeda é fixa (APP_CONFIG.currency) por ser regra de negócio.
 */
let currentLocale: string = APP_CONFIG.locale;
const cache = new Map<string, Intl.NumberFormat>();

export function setFormatLocale(locale: string): void {
  currentLocale = locale;
}
export function getFormatLocale(): string {
  return currentLocale;
}

function nf(kind: string, opts: Intl.NumberFormatOptions): Intl.NumberFormat {
  const k = `${currentLocale}|${kind}`;
  let f = cache.get(k);
  if (!f) {
    f = new Intl.NumberFormat(currentLocale, opts);
    cache.set(k, f);
  }
  return f;
}

const safe = (v: number) => (Number.isFinite(v) ? v : 0);

export const formatCurrency = (v: number) => nf('cur', { style: 'currency', currency: APP_CONFIG.currency }).format(safe(v));
export const formatCurrencyCompact = (v: number) =>
  nf('curc', { style: 'currency', currency: APP_CONFIG.currency, notation: 'compact', maximumFractionDigits: 1 }).format(safe(v));
export const formatNumber = (v: number) => nf('num', {}).format(v);
export const formatPercent = (v: number, digits = 0) =>
  nf(`pct${digits}`, { style: 'percent', minimumFractionDigits: digits, maximumFractionDigits: digits }).format(safe(v) / 100);

const cap = (s: string) => s.charAt(0).toUpperCase() + s.slice(1);

/** `2026-11-12` → `12/11/2026` | `11/12/2026` | `12.11.2026` */
export function formatDate(iso: string | undefined): string {
  if (!iso) return '—';
  return parseISODate(iso).toLocaleDateString(currentLocale);
}

/** `2026-11-12` → `Qui., 12 de nov.` (conforme idioma) */
export function formatDateShort(iso: string): string {
  return cap(parseISODate(iso).toLocaleDateString(currentLocale, { weekday: 'short', day: '2-digit', month: 'short' }));
}

/** `2026-11-12` → `Quinta-feira, 12 de novembro de 2026` */
export function formatDateLong(iso: string): string {
  return cap(parseISODate(iso).toLocaleDateString(currentLocale, { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' }));
}

/** Nome curto do dia da semana: `Seg` / `Mon` / `Mo`. */
export function formatWeekday(iso: string): string {
  return cap(parseISODate(iso).toLocaleDateString(currentLocale, { weekday: 'short' }).replace('.', ''));
}

/** `novembro de 2026` / `November 2026` */
export function formatMonthYear(iso: string): string {
  return cap(parseISODate(iso).toLocaleDateString(currentLocale, { month: 'long', year: 'numeric' }));
}

/** Intervalo `10 – 16 de nov. de 2026` usando Intl.DateTimeFormat#formatRange. */
export function formatDateRange(startIso: string, endIso: string): string {
  const f = new Intl.DateTimeFormat(currentLocale, { day: 'numeric', month: 'short', year: 'numeric' });
  return f.formatRange(parseISODate(startIso), parseISODate(endIso));
}

/** Iniciais para avatar. */
export function initials(name: string): string {
  const parts = name.trim().split(/\s+/);
  const first = parts[0]?.[0] ?? '';
  const last = parts.length > 1 ? (parts[parts.length - 1]?.[0] ?? '') : '';
  return (first + last).toUpperCase();
}
