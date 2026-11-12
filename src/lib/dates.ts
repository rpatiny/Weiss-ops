/**
 * Utilitários de data trabalhando com strings `YYYY-MM-DD` em horário LOCAL
 * (evita os deslocamentos de fuso de `new Date('YYYY-MM-DD')`, que é UTC).
 */

const pad = (n: number) => String(n).padStart(2, '0');

export function toISODate(d: Date): string {
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
}

export function parseISODate(iso: string): Date {
  const [y, m, d] = iso.split('-').map(Number);
  return new Date(y ?? 1970, (m ?? 1) - 1, d ?? 1);
}

export function todayISO(): string {
  return toISODate(new Date());
}

export function addDays(iso: string, days: number): string {
  const d = parseISODate(iso);
  d.setDate(d.getDate() + days);
  return toISODate(d);
}

export function addMonths(iso: string, months: number): string {
  const d = parseISODate(iso);
  const day = d.getDate();
  d.setDate(1);
  d.setMonth(d.getMonth() + months);
  const last = new Date(d.getFullYear(), d.getMonth() + 1, 0).getDate();
  d.setDate(Math.min(day, last));
  return toISODate(d);
}

/** Segunda-feira da semana de `iso`. */
export function startOfWeek(iso: string): string {
  const d = parseISODate(iso);
  const dow = (d.getDay() + 6) % 7; // 0 = segunda
  d.setDate(d.getDate() - dow);
  return toISODate(d);
}

export function startOfMonth(iso: string): string {
  return iso.slice(0, 8) + '01';
}

export function endOfMonth(iso: string): string {
  const d = parseISODate(iso);
  return toISODate(new Date(d.getFullYear(), d.getMonth() + 1, 0));
}

/** Lista de datas consecutivas a partir de `start`. */
export function dateRange(start: string, count: number): string[] {
  return Array.from({ length: count }, (_, i) => addDays(start, i));
}

/** Diferença em dias (b - a). */
export function diffDays(a: string, b: string): number {
  return Math.round((parseISODate(b).getTime() - parseISODate(a).getTime()) / 86_400_000);
}

/** `YYYY-MM` de uma data ISO. */
export function monthKey(iso: string): string {
  return iso.slice(0, 7);
}

/** `HH:mm` → minutos desde 00:00. */
export function timeToMinutes(t: string): number {
  const [h, m] = t.split(':').map(Number);
  return (h ?? 0) * 60 + (m ?? 0);
}

export function isWeekend(iso: string): boolean {
  const dow = parseISODate(iso).getDay();
  return dow === 0 || dow === 6;
}

// ───────── Dias úteis (seg–sex) ─────────

export const isBusinessDay = (iso: string) => !isWeekend(iso);

/** Próximo dia útil (o próprio dia, se já for útil). */
export function snapForward(iso: string): string {
  let d = iso;
  while (isWeekend(d)) d = addDays(d, 1);
  return d;
}

/** Dia útil anterior (o próprio dia, se já for útil). */
export function snapBackward(iso: string): string {
  let d = iso;
  while (isWeekend(d)) d = addDays(d, -1);
  return d;
}

/** Soma `n` dias úteis (n pode ser negativo). `addBusinessDays(seg, 0) = seg`. */
export function addBusinessDays(iso: string, n: number): string {
  let d = n >= 0 ? snapForward(iso) : snapBackward(iso);
  const step = n >= 0 ? 1 : -1;
  for (let left = Math.abs(n); left > 0; ) {
    d = addDays(d, step);
    if (!isWeekend(d)) left--;
  }
  return d;
}

/** Quantidade de dias úteis entre `a` e `b`, inclusive. */
export function businessDaysBetween(a: string, b: string): number {
  if (b < a) return 0;
  let count = 0;
  for (let d = a; d <= b; d = addDays(d, 1)) if (!isWeekend(d)) count++;
  return count;
}

/** Interseção de intervalos fechados [aStart, aEnd] ∩ [bStart, bEnd]. */
export function rangesOverlap(aStart: string, aEnd: string, bStart: string, bEnd: string): boolean {
  return aStart <= bEnd && bStart <= aEnd;
}
