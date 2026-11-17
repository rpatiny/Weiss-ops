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
import type { POLineItem, ProjectMaterial, ShopfloorRequest } from '@/types/models';
import { derivePOStatus } from './purchasing';
import { addDays, businessDaysBetween, todayISO } from '@/lib/dates';
import { localDay, verifyClockPin } from './timeTracking';

export interface ShopfloorInput {
  photo: string;
  description: string;
  quantity: number;
  supplier: string;
  supplierCode: string;
  /** Projeto escolhido ou 'general' (uso geral / estoque). Escolha obrigatória. */
  projectId: string;
}

export type ShopfloorField = keyof ShopfloorInput;

export interface ShopfloorOrderInput {
  supplierId: string;
  poNumber: string;
  unitPrice: number;
  expectedDate: string;
}

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

export const SHOPFLOOR_FIELDS: readonly ShopfloorField[] = ['photo', 'description', 'quantity', 'supplier', 'supplierCode', 'projectId'];
export const GENERAL = 'general';

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
      projectId: input.projectId && input.projectId !== GENERAL ? input.projectId : undefined,
      status: 'new',
    };
    repos.shopfloorRequests.create(request);
    return { ok: true, request };
  },

  /**
   * Logística: registra a PO do SAP para o pedido — cria a PO de compra (ou acrescenta a linha numa PO existente do mesmo
   * fornecedor). Se o pedido é de um projeto, o item vira material do projeto ligado à linha (entra na prontidão e no GR).
   */
  order(id: string, input: ShopfloorOrderInput): { ok: true } | { ok: false; error: TranslationKey } {
    const user = assertCan('requisition.process');
    const r = repos.shopfloorRequests.getById(id);
    if (!r) return { ok: false, error: 'shopfloor.validation.required' };
    const supplier = repos.suppliers.getById(input.supplierId);
    if (!supplier) return { ok: false, error: 'process.validation.supplierRequired' };
    const poNumber = input.poNumber.trim();
    if (!poNumber) return { ok: false, error: 'process.validation.poNumberRequired' };
    if (!input.expectedDate) return { ok: false, error: 'shopfloor.validation.expectedDate' };
    const existing = repos.purchaseOrders.getAll().find((p) => p.poNumber.trim() === poNumber);
    if (existing && (existing.kind !== 'purchase' || existing.supplierId !== supplier.id)) return { ok: false, error: 'process.validation.poNumberTaken' };
    const project = r.projectId ? repos.projects.getById(r.projectId) : undefined;
    const startLine = existing ? Math.max(0, ...existing.lines.map((l) => l.lineNumber)) : 0;
    const line: POLineItem = {
      id: newId('pol'),
      lineNumber: startLine + 10,
      partNumber: r.supplierCode,
      description: r.description,
      quantity: r.quantity,
      unitPrice: Math.max(0, input.unitPrice || 0),
      expectedDeliveryDate: input.expectedDate,
      status: 'open',
      receipts: [],
    };
    const po = existing
      ? repos.purchaseOrders.update(existing.id, { lines: [...existing.lines, line], status: derivePOStatus(existing.status, [...existing.lines, line]) })
      : repos.purchaseOrders.create({
          id: newId('po'),
          poNumber,
          kind: 'purchase',
          supplierId: supplier.id,
          customerOrVendor: supplier.name,
          orderDate: todayISO(),
          requester: repos.employees.getById(r.employeeId)?.name ?? '',
          paymentTerms: '',
          status: 'open',
          notes: [`${r.number} (shop floor)`, project ? `${project.projectNumber} — ${project.customer}` : ''].filter(Boolean).join('\n'),
          attachments: [],
          lines: [line],
        });
    if (project) {
      const material: ProjectMaterial = { id: newId('mat'), partNumber: r.supplierCode, description: r.description, quantity: r.quantity, status: 'ordered', poId: po.id, poLineId: line.id, neededBy: todayISO() };
      repos.projects.update(project.id, { materials: [...project.materials, material] });
    }
    repos.shopfloorRequests.update(id, { status: 'ordered', note: poNumber, poId: po.id, poLineId: line.id, handledBy: user.id, handledAt: new Date().toISOString() });
    return { ok: true };
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
    // A PO criada continua em Compras (tem histórico próprio); o pedido só volta a 'novo'.
    repos.shopfloorRequests.update(id, { status: 'new', note: undefined, handledBy: undefined, handledAt: undefined, poId: undefined, poLineId: undefined });
  },
};
