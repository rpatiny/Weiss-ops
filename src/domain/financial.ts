/**
 * Hub Financeiro: spindles/motores (cotação → reparo → entrega/faturamento), forecast ponderado,
 * indicadores do mês, série mensal Realizado × Forecast e ranking de clientes.
 */
import { assertCan } from '@/app/session';
import { repos } from '@/data/db';
import type { TranslationKey } from '@/i18n/types';
import { addMonths, monthKey, startOfMonth, todayISO } from '@/lib/dates';
import { newId } from '@/lib/id';
import type { ForecastItem, SpindleUnit } from '@/types/models';

/** Valor ponderado do forecast = valor estimado × probabilidade. */
export const weightedValue = (f: Pick<ForecastItem, 'estimatedValue' | 'probability'>) => (f.estimatedValue || 0) * ((f.probability || 0) / 100);

/** Valor faturado efetivo de uma unidade entregue (faturado informado, senão o cotado). */
export const billedValue = (s: SpindleUnit) => s.invoicedValue ?? s.quotedValue ?? 0;

/** Em reparo/carteira: aprovado e ainda não entregue. */
export const isBacklog = (s: SpindleUnit) => s.status === 'approved' || s.status === 'in_repair' || s.status === 'testing';

export function deliveredIn(spindles: readonly SpindleUnit[], ym: string) {
  const items = spindles.filter((s) => s.status === 'delivered' && s.deliveryDate && monthKey(s.deliveryDate) === ym);
  return {
    items,
    count: items.length,
    total: items.reduce((sum, s) => sum + billedValue(s), 0),
    missingInvoice: items.filter((s) => s.invoicedValue === undefined).length,
  };
}

export interface QuoteStats {
  pending: number;
  sent: number;
  approved: number;
  declined: number;
  /** aprovadas / (aprovadas + recusadas); null sem decisões. */
  approvalRate: number | null;
  sentValue: number;
  approvedValue: number;
}

export function quoteStats(spindles: readonly SpindleUnit[]): QuoteStats {
  const by = (st: SpindleUnit['quoteStatus']) => spindles.filter((s) => s.quoteStatus === st);
  const approved = by('approved');
  const declined = by('declined');
  const decided = approved.length + declined.length;
  return {
    pending: by('pending').length,
    sent: by('sent').length,
    approved: approved.length,
    declined: declined.length,
    approvalRate: decided ? (approved.length / decided) * 100 : null,
    sentValue: by('sent').reduce((s, x) => s + (x.quotedValue || 0), 0),
    approvedValue: approved.reduce((s, x) => s + (x.quotedValue || 0), 0),
  };
}

export interface MonthPoint {
  month: string; // YYYY-MM
  actual: number;
  forecast: number;
  isCurrent: boolean;
  isFuture: boolean;
}

/** Série mensal: faturado (por mês de entrega) × forecast ponderado (por mês previsto). */
export function monthlySeries(spindles: readonly SpindleUnit[], forecast: readonly ForecastItem[], monthsBack = 5, monthsAhead = 6, today = todayISO()): MonthPoint[] {
  const current = monthKey(today);
  const out: MonthPoint[] = [];
  for (let i = -monthsBack; i <= monthsAhead; i++) {
    const ym = monthKey(addMonths(startOfMonth(today), i));
    out.push({
      month: ym,
      actual: deliveredIn(spindles, ym).total,
      forecast: forecast.filter((f) => monthKey(f.expectedDate) === ym).reduce((s, f) => s + weightedValue(f), 0),
      isCurrent: ym === current,
      isFuture: ym > current,
    });
  }
  return out;
}

/** Forecast ponderado com data prevista entre hoje e +N meses. */
export function forecastNextMonths(forecast: readonly ForecastItem[], months = 3, today = todayISO()) {
  const end = addMonths(today, months);
  const items = forecast.filter((f) => f.expectedDate >= today && f.expectedDate <= end);
  return { items, weighted: items.reduce((s, f) => s + weightedValue(f), 0), gross: items.reduce((s, f) => s + (f.estimatedValue || 0), 0) };
}

export interface CustomerRank {
  customer: string;
  invoiced: number;
  delivered: number;
  units: number;
  backlog: number;
  forecastWeighted: number;
}

/** Ranking de clientes por receita faturada (desempate: volume de unidades). */
export function customerRanking(spindles: readonly SpindleUnit[], forecast: readonly ForecastItem[]): CustomerRank[] {
  const map = new Map<string, CustomerRank>();
  const get = (c: string) => {
    let r = map.get(c);
    if (!r) map.set(c, (r = { customer: c, invoiced: 0, delivered: 0, units: 0, backlog: 0, forecastWeighted: 0 }));
    return r;
  };
  for (const s of spindles) {
    const r = get(s.customer);
    r.units++;
    if (s.status === 'delivered') {
      r.delivered++;
      r.invoiced += billedValue(s);
    }
    if (isBacklog(s)) r.backlog += s.quotedValue || 0;
  }
  for (const f of forecast) get(f.customer).forecastWeighted += weightedValue(f);
  return [...map.values()].sort((a, b) => b.invoiced - a.invoiced || b.units - a.units || a.customer.localeCompare(b.customer));
}

// ───────────── Validação & comandos ─────────────

export type SpindleDraft = Omit<SpindleUnit, 'id'>;
export type ForecastDraft = Omit<ForecastItem, 'id'>;
type Errors<T> = Partial<Record<keyof T, TranslationKey>>;

export function validateSpindle(d: SpindleDraft, all: readonly SpindleUnit[], selfId?: string): Errors<SpindleDraft> {
  const e: Errors<SpindleDraft> = {};
  if (!d.serialNumber.trim()) e.serialNumber = 'financial.validation.serialRequired';
  else if (all.some((s) => s.id !== selfId && s.serialNumber.trim().toLowerCase() === d.serialNumber.trim().toLowerCase())) e.serialNumber = 'financial.validation.serialDuplicate';
  if (!d.customer.trim()) e.customer = 'financial.validation.customerRequired';
  if (!d.model.trim()) e.model = 'financial.validation.modelRequired';
  if (!d.receivedDate) e.receivedDate = 'financial.validation.dateRequired';
  if (d.quotedValue < 0) e.quotedValue = 'financial.validation.valueInvalid';
  if (d.status === 'delivered' && !d.deliveryDate) e.deliveryDate = 'financial.validation.deliveryRequired';
  return e;
}

export function validateForecast(d: ForecastDraft): Errors<ForecastDraft> {
  const e: Errors<ForecastDraft> = {};
  if (!d.customer.trim()) e.customer = 'financial.validation.customerRequired';
  if (!d.spindleModel.trim()) e.spindleModel = 'financial.validation.modelRequired';
  if (!(d.estimatedValue > 0)) e.estimatedValue = 'financial.validation.valueInvalid';
  if (!d.expectedDate) e.expectedDate = 'financial.validation.dateRequired';
  if (d.probability < 0 || d.probability > 100) e.probability = 'financial.validation.probabilityRange';
  return e;
}

export const spindleService = {
  save(d: SpindleDraft, id?: string): SpindleUnit {
    assertCan('financial.edit');
    const clean: SpindleDraft = {
      ...d,
      serialNumber: d.serialNumber.trim(),
      model: d.model.trim(),
      manufacturer: d.manufacturer.trim(),
      customer: d.customer.trim(),
      quoteNumber: d.quoteNumber.trim(),
      quotedValue: Number(d.quotedValue) || 0,
      invoicedValue: d.invoicedValue === undefined || Number.isNaN(d.invoicedValue) ? undefined : Number(d.invoicedValue),
      deliveryDate: d.deliveryDate || undefined,
      poId: d.poId || undefined,
    };
    return id ? repos.spindles.update(id, clean) : repos.spindles.create({ id: newId('sp'), ...clean });
  },
  /** Remove a unidade e desfaz vínculos com projetos. */
  remove(id: string): void {
    assertCan('financial.edit');
    repos.projects.replaceAll(repos.projects.getAll().map((p) => (p.spindleId === id ? { ...p, spindleId: undefined } : p)));
    repos.spindles.remove(id);
  },
};

export const forecastService = {
  save(d: ForecastDraft, id?: string): ForecastItem {
    assertCan('financial.edit');
    const clean = { ...d, customer: d.customer.trim(), spindleModel: d.spindleModel.trim(), description: d.description.trim(), probability: Math.min(100, Math.max(0, Math.round(d.probability))) };
    return id ? repos.forecast.update(id, clean) : repos.forecast.create({ id: newId('fc'), ...clean });
  },
  remove(id: string): void {
    assertCan('financial.edit');
    repos.forecast.remove(id);
  },
};
