/**
 * Pedidos de compra do chão de fábrica (shop floor).
 *
 * - QR code no shop floor → `#/shop-request` no celular, sem login no app.
 * - Ordem dos passos: foto → descrição → quantidade → fornecedor → código do fornecedor (todos obrigatórios);
 *   no fim o técnico se identifica com o PIN do ponto (`verifyClockPin`) — quem pediu fica registrado.
 * - A Logística (`requisition.process`) marca como pedido (nº da PO) ou recusa (motivo).
 */
import { assertCan } from '@/app/session';
import { repos } from '@/data/db';
import type { TranslationKey } from '@/i18n/types';
import { newId } from '@/lib/id';
import type { ShopfloorRequest } from '@/types/models';
import { addDays, businessDaysBetween, todayISO } from '@/lib/dates';
import { localDay, verifyClockPin } from './timeTracking';

export interface ShopfloorInput {
  photo: string;
  description: string;
  quantity: number;
  supplier: string;
  supplierCode: string;
}

export type ShopfloorField = keyof ShopfloorInput;

/** Valida um passo (a tela usa a mesma regra do serviço). */
export function validateShopfloorField(field: ShopfloorField, v: ShopfloorInput): TranslationKey | undefined {
  switch (field) {
    case 'photo':
      return /^data:image\//.test(v.photo) ? undefined : 'shopfloor.validation.photo';
    case 'quantity':
      return Number.isInteger(v.quantity) && v.quantity > 0 ? undefined : 'shopfloor.validation.quantity';
    default:
      return v[field].trim() ? undefined : 'shopfloor.validation.required';
  }
}

export const SHOPFLOOR_FIELDS: readonly ShopfloorField[] = ['photo', 'description', 'quantity', 'supplier', 'supplierCode'];

function nextNumber(): string {
  const used = new Set(repos.shopfloorRequests.getAll().map((r) => r.number));
  let n = used.size + 1;
  let num = `SF-${String(n).padStart(5, '0')}`;
  while (used.has(num)) num = `SF-${String(++n).padStart(5, '0')}`;
  return num;
}

export const isPendingShopfloor = (r: ShopfloorRequest) => r.status === 'new';

// ───────────── Aging (pedido parado sem ação vira prioridade) ─────────────

/** Faixas de envelhecimento em DIAS ÚTEIS sem ação da Logística. */
export type AgingBucket = 'fresh' | 'waiting' | 'priority' | 'urgent';
export const AGING_BUCKETS: readonly AgingBucket[] = ['fresh', 'waiting', 'priority', 'urgent'];
/** Limite inferior de cada faixa (dias úteis parados): 0–1 novo · 2–3 aguardando · 4–6 prioridade · 7+ urgente. */
export const AGING_FROM: Record<AgingBucket, number> = { fresh: 0, waiting: 2, priority: 4, urgent: 7 };

/** Dias úteis desde o pedido (o dia do pedido não conta). */
export function shopfloorAge(r: ShopfloorRequest, today = todayISO()): number {
  const day = localDay(r.createdAt);
  return day >= today ? 0 : businessDaysBetween(addDays(day, 1), today);
}

export function agingBucket(days: number): AgingBucket {
  return days >= AGING_FROM.urgent ? 'urgent' : days >= AGING_FROM.priority ? 'priority' : days >= AGING_FROM.waiting ? 'waiting' : 'fresh';
}

export const shopfloorService = {
  /** Shop floor (sem login): exige PIN do ponto válido e todos os campos. */
  create(employeeId: string, pin: string, input: ShopfloorInput): { ok: true; request: ShopfloorRequest } | { ok: false; error: TranslationKey } {
    if (!verifyClockPin(employeeId, pin)) return { ok: false, error: 'shopfloor.validation.pin' };
    for (const f of SHOPFLOOR_FIELDS) {
      const err = validateShopfloorField(f, input);
      if (err) return { ok: false, error: err };
    }
    const request: ShopfloorRequest = {
      id: newId('sfr'),
      number: nextNumber(),
      employeeId,
      createdAt: new Date().toISOString(),
      photo: input.photo,
      description: input.description.trim(),
      quantity: input.quantity,
      supplier: input.supplier.trim(),
      supplierCode: input.supplierCode.trim(),
      status: 'new',
    };
    repos.shopfloorRequests.create(request);
    return { ok: true, request };
  },

  /** Logística: pedido feito (nº da PO obrigatório). */
  markOrdered(id: string, poNumber: string): void {
    const user = assertCan('requisition.process');
    if (!poNumber.trim()) throw new Error('shopfloor.validation.required');
    repos.shopfloorRequests.update(id, { status: 'ordered', note: poNumber.trim(), handledBy: user.id, handledAt: new Date().toISOString() });
  },

  /** Logística: recusa (motivo obrigatório). */
  reject(id: string, reason: string): void {
    const user = assertCan('requisition.process');
    if (!reason.trim()) throw new Error('shopfloor.validation.required');
    repos.shopfloorRequests.update(id, { status: 'rejected', note: reason.trim(), handledBy: user.id, handledAt: new Date().toISOString() });
  },

  /** Logística: volta para "novo" (desfaz um engano). */
  reopen(id: string): void {
    assertCan('requisition.process');
    repos.shopfloorRequests.update(id, { status: 'new', note: undefined, handledBy: undefined, handledAt: undefined });
  },
};
