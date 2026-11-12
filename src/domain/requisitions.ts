/**
 * Processo de compras:
 *   Office cria a REQUISIÇÃO → Logística cota e cria a PO no SAP → registra a PO aqui
 *   → material chega, GR no SAP → Logística registra o GR aqui → projetos atualizam na hora.
 */
import { assertCan, can, getCurrentUser } from '@/app/session';
import { repos } from '@/data/db';
import type { TranslationKey } from '@/i18n/types';
import { todayISO } from '@/lib/dates';
import { newId } from '@/lib/id';
import type {
  GoodsReceipt,
  POLineItem,
  Project,
  PurchaseOrder,
  PurchaseRequisition,
  RequisitionEvent,
  RequisitionStatus,
} from '@/types/models';
import { derivePOStatus } from './purchasing';
import { materialStatus } from './schedule';

const nowStamp = () => new Date().toISOString().slice(0, 19);

// ───────────── Status efetivo ─────────────

export interface RequisitionItemView {
  itemId: string;
  status: 'to_buy' | 'requested' | 'ordered' | 'received';
  po?: PurchaseOrder;
  line?: POLineItem;
}

export function requisitionItemViews(pr: PurchaseRequisition, project: Project | undefined, poById: ReadonlyMap<string, PurchaseOrder>): RequisitionItemView[] {
  return pr.items.map((it) => {
    const m = project?.materials.find((x) => x.id === it.materialId);
    if (!m) return { itemId: it.id, status: 'requested' };
    const { status, po, line } = materialStatus(m, poById);
    return { itemId: it.id, status, po, line };
  });
}

/** Pedido/recebimento derivados dos materiais; rejeitada/cancelada são manuais. */
export function effectiveStatus(pr: PurchaseRequisition, views: readonly RequisitionItemView[]): RequisitionStatus {
  if (pr.status === 'rejected' || pr.status === 'canceled') return pr.status;
  const n = views.length;
  const received = views.filter((v) => v.status === 'received').length;
  const ordered = views.filter((v) => v.status === 'ordered' || v.status === 'received').length;
  if (n && received === n) return 'received';
  if (received > 0) return 'partially_received';
  if (n && ordered === n) return 'ordered';
  if (ordered > 0) return 'partially_ordered';
  return pr.status === 'quoting' ? 'quoting' : 'submitted';
}

/** Requisições que exigem ação da logística. */
export const needsLogistics = (s: RequisitionStatus) => s === 'submitted' || s === 'quoting' || s === 'partially_ordered';

export function nextRequisitionNumber(): string {
  const used = new Set(repos.requisitions.getAll().map((r) => r.number));
  let n = repos.requisitions.getAll().length + 1;
  let num = `RC-${String(n).padStart(5, '0')}`;
  while (used.has(num)) num = `RC-${String(++n).padStart(5, '0')}`;
  return num;
}

// ───────────── Recebimentos ─────────────

export const receivedQty = (l: POLineItem) => (l.receipts ?? []).reduce((s, r) => s + r.quantity, 0);
export const openQty = (l: POLineItem) => Math.max(0, l.quantity - receivedQty(l));

// ───────────── Comandos ─────────────

function addEvent(id: string, userId: string, action: RequisitionEvent['action'], note = '') {
  const pr = repos.requisitions.getById(id);
  if (pr) repos.requisitions.update(id, { history: [...pr.history, { at: nowStamp(), userId, action, note }] });
}

/** Libera materiais ainda sem PO (voltam a "a comprar"). */
function releaseMaterials(pr: PurchaseRequisition) {
  const p = repos.projects.getById(pr.projectId);
  if (!p) return;
  const ids = new Set(pr.items.map((i) => i.materialId));
  repos.projects.update(p.id, {
    materials: p.materials.map((m) => (ids.has(m.id) && !m.poId ? { ...m, requisitionId: undefined, status: 'to_buy' as const } : m)),
  });
}

export type RegisterPOInput = {
  poNumber: string;
  supplierId: string;
  orderDate: string;
  expectedDate: string;
  paymentTerms: string;
  notes: string;
  items: { itemId: string; quantity: number; unitPrice: number; expectedDate?: string }[];
};

export type GRInput = {
  grNumber: string;
  date: string;
  notes: string;
  lines: { lineId: string; quantity: number }[];
};

export const requisitionService = {
  /** Office: cria a requisição a partir de materiais "a comprar" de um projeto. */
  create(projectId: string, materialIds: string[], opts: { neededBy?: string; notes: string }): PurchaseRequisition | undefined {
    const user = assertCan('requisition.create');
    const p = repos.projects.getById(projectId);
    if (!p) return undefined;
    const mats = p.materials.filter((m) => materialIds.includes(m.id) && !m.poId && !m.requisitionId);
    if (!mats.length) return undefined;
    const pr: PurchaseRequisition = {
      id: newId('rc'),
      number: nextRequisitionNumber(),
      projectId,
      requestedBy: user.id,
      requestedAt: todayISO(),
      neededBy: opts.neededBy || undefined,
      status: 'submitted',
      notes: opts.notes.trim(),
      items: mats.map((m) => ({ id: newId('ri'), materialId: m.id, partNumber: m.partNumber, description: m.description, quantity: m.quantity })),
      history: [{ at: nowStamp(), userId: user.id, action: 'submitted', note: '' }],
    };
    repos.requisitions.create(pr);
    const ids = new Set(mats.map((m) => m.id));
    repos.projects.update(p.id, { materials: p.materials.map((m) => (ids.has(m.id) ? { ...m, requisitionId: pr.id, status: 'requested' as const } : m)) });
    return pr;
  },

  /** Logística: indica que está cotando com fornecedores. */
  startQuoting(id: string, note = ''): void {
    const user = assertCan('requisition.process');
    repos.requisitions.update(id, { status: 'quoting' });
    addEvent(id, user.id, 'quoting', note);
  },

  comment(id: string, note: string): void {
    const user = getCurrentUser();
    if (!user || !(can('requisition.create', user) || can('requisition.process', user))) throw new Error('auth.forbidden');
    addEvent(id, user.id, 'comment', note);
  },

  reject(id: string, reason: string): void {
    const user = assertCan('requisition.process');
    const pr = repos.requisitions.getById(id);
    if (!pr) return;
    repos.requisitions.update(id, { status: 'rejected' });
    addEvent(id, user.id, 'rejected', reason);
    releaseMaterials(pr);
  },

  cancel(id: string, reason: string): void {
    const user = assertCan('requisition.create');
    const pr = repos.requisitions.getById(id);
    if (!pr) return;
    repos.requisitions.update(id, { status: 'canceled' });
    addEvent(id, user.id, 'canceled', reason);
    releaseMaterials(pr);
  },

  /**
   * Logística: registra a PO criada no SAP para itens da requisição. Se o nº da PO já existir
   * (mesmo fornecedor), as linhas são acrescentadas a ela. Os materiais passam a "comprado".
   */
  registerSapPO(id: string, input: RegisterPOInput): { po?: PurchaseOrder; error?: TranslationKey } {
    const user = assertCan('requisition.process');
    const pr = repos.requisitions.getById(id);
    const project = pr && repos.projects.getById(pr.projectId);
    const supplier = repos.suppliers.getById(input.supplierId);
    if (!pr || !project) return {};
    if (!input.poNumber.trim()) return { error: 'process.validation.poNumberRequired' };
    if (!supplier) return { error: 'process.validation.supplierRequired' };
    const chosen = input.items.filter((i) => i.quantity > 0);
    if (!chosen.length) return { error: 'process.validation.itemsRequired' };

    const existing = repos.purchaseOrders.getAll().find((p) => p.poNumber.trim() === input.poNumber.trim());
    if (existing && (existing.kind !== 'purchase' || existing.supplierId !== supplier.id)) return { error: 'process.validation.poNumberTaken' };

    const startLine = existing ? Math.max(0, ...existing.lines.map((l) => l.lineNumber)) : 0;
    const newLines: (POLineItem & { itemId: string })[] = chosen.map((c, i) => {
      const it = pr.items.find((x) => x.id === c.itemId)!;
      return {
        id: newId('pol'),
        itemId: c.itemId,
        lineNumber: (startLine + i + 1) * 10,
        partNumber: it.partNumber,
        description: it.description,
        quantity: c.quantity,
        unitPrice: c.unitPrice,
        expectedDeliveryDate: c.expectedDate || input.expectedDate,
        status: 'open',
        receipts: [],
      };
    });
    const lines: POLineItem[] = newLines.map(({ itemId: _i, ...l }) => l);

    let po: PurchaseOrder;
    if (existing) {
      po = repos.purchaseOrders.update(existing.id, { lines: [...existing.lines, ...lines], status: derivePOStatus(existing.status, [...existing.lines, ...lines]) });
    } else {
      po = repos.purchaseOrders.create({
        id: newId('po'),
        poNumber: input.poNumber.trim(),
        kind: 'purchase',
        supplierId: supplier.id,
        customerOrVendor: supplier.name,
        requisitionId: pr.id,
        orderDate: input.orderDate,
        requester: repos.users.getById(pr.requestedBy)?.name ?? '',
        paymentTerms: input.paymentTerms.trim(),
        status: 'open',
        notes: [`${pr.number} · ${project.projectNumber} — ${project.customer}`, input.notes.trim()].filter(Boolean).join('\n'),
        attachments: [],
        lines,
      });
    }

    const lineByMaterial = new Map(newLines.map((l) => [pr.items.find((x) => x.id === l.itemId)!.materialId, l.id]));
    repos.projects.update(project.id, {
      materials: project.materials.map((m) => (lineByMaterial.has(m.id) ? { ...m, status: 'ordered' as const, poId: po.id, poLineId: lineByMaterial.get(m.id) } : m)),
    });
    addEvent(pr.id, user.id, 'po_registered', `PO ${po.poNumber} — ${supplier.name}`);
    return { po };
  },

  /**
   * Logística: registra o GR (após o goods receipt no SAP). Aceita recebimento parcial;
   * a linha fica "entregue" quando a quantidade recebida atinge a pedida.
   */
  registerGR(poId: string, input: GRInput): { error?: TranslationKey } {
    const user = assertCan('gr.register');
    const po = repos.purchaseOrders.getById(poId);
    if (!po) return {};
    if (!input.grNumber.trim()) return { error: 'process.validation.grNumberRequired' };
    const qtyByLine = new Map(input.lines.filter((l) => l.quantity > 0).map((l) => [l.lineId, l.quantity]));
    if (!qtyByLine.size) return { error: 'process.validation.grQtyRequired' };

    const lines = po.lines.map((l) => {
      const q = qtyByLine.get(l.id);
      if (!q) return l;
      const receipt: GoodsReceipt = { id: newId('gr'), grNumber: input.grNumber.trim(), date: input.date, quantity: q, receivedBy: user.id, notes: input.notes.trim() };
      const receipts = [...(l.receipts ?? []), receipt];
      const total = receipts.reduce((s, r) => s + r.quantity, 0);
      const done = total >= l.quantity;
      return { ...l, receipts, status: done ? ('delivered' as const) : ('partial' as const), actualDeliveryDate: done ? input.date : l.actualDeliveryDate };
    });
    repos.purchaseOrders.update(po.id, { lines, status: derivePOStatus(po.status, lines) });

    // Mantém o status gravado dos materiais em sincronia (o efetivo já é derivado da linha).
    const delivered = new Set(lines.filter((l) => l.status === 'delivered').map((l) => l.id));
    repos.projects.replaceAll(
      repos.projects.getAll().map((p) =>
        p.materials.some((m) => m.poId === po.id && m.poLineId && delivered.has(m.poLineId))
          ? { ...p, materials: p.materials.map((m) => (m.poId === po.id && m.poLineId && delivered.has(m.poLineId) ? { ...m, status: 'received' as const } : m)) }
          : p,
      ),
    );

    // Histórico nas requisições dos materiais recebidos.
    const touched = new Set(qtyByLine.keys());
    const prIds = new Set<string>();
    for (const p of repos.projects.getAll()) for (const m of p.materials) if (m.poId === po.id && m.poLineId && touched.has(m.poLineId) && m.requisitionId) prIds.add(m.requisitionId);
    const summary = po.lines.filter((l) => touched.has(l.id)).map((l) => `${l.partNumber} × ${qtyByLine.get(l.id)}`).join(', ');
    for (const id of prIds) addEvent(id, user.id, 'gr_registered', `GR ${input.grNumber.trim()} — ${summary}`);
    return {};
  },
};
