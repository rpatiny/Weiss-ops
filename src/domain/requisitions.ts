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
  CatalogMaterial,
  GoodsReceipt,
  RequisitionItem,
  RequisitionSupplier,
  SupplierOffer,
  POLineItem,
  Project,
  PurchaseOrder,
  PurchaseRequisition,
  RequisitionEvent,
  RequisitionStatus,
} from '@/types/models';
import { derivePOStatus, normPN } from './purchasing';
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
  // Cotação: todos os itens com fornecedor escolhido e preço ⇒ pronto para a PO (o Office pode já mandar assim).
  if (n && pr.items.every((it) => chosenQuote(it)?.price !== undefined)) return 'quoted';
  const anyQuoteWork = pr.items.some((it) => (it.suppliers ?? []).some((s) => s.rfqSentAt || s.price !== undefined));
  return pr.status === 'quoting' || anyQuoteWork ? 'quoting' : 'submitted';
}

/** Cotação do fornecedor escolhido de um item. */
export const chosenQuote = (it: RequisitionItem) => (it.chosenSupplierId ? (it.suppliers ?? []).find((s) => s.supplierId === it.chosenSupplierId) : undefined);

/** Melhor cotação de um item: menor preço; empate ⇒ menor prazo. */
export function bestQuote(it: RequisitionItem): RequisitionSupplier | undefined {
  return (it.suppliers ?? [])
    .filter((s) => s.price !== undefined)
    .sort((a, b) => a.price! - b.price! || (a.leadTimeDays ?? 9999) - (b.leadTimeDays ?? 9999))[0];
}

/** Ordem das etapas do pedido (barra de progresso da tela). */
export const STAGES = ['submitted', 'quoting', 'quoted', 'ordered', 'received'] as const;
export type Stage = (typeof STAGES)[number];
export function stageOf(s: RequisitionStatus): Stage | 'closed' {
  if (s === 'rejected' || s === 'canceled') return 'closed';
  if (s === 'partially_ordered' || s === 'ordered' || s === 'partially_received') return s === 'partially_received' ? 'ordered' : 'ordered';
  return s as Stage;
}

/** E-mail de pedido de cotação (RFQ) para um fornecedor — itens dele, quantidades e prazo. */
export function rfqMailto(pr: PurchaseRequisition, supplierId: string): string {
  const sup = repos.suppliers.getById(supplierId);
  const project = repos.projects.getById(pr.projectId);
  const items = pr.items.filter((it) => (it.suppliers ?? []).some((s) => s.supplierId === supplierId));
  const lines = items.map((it) => `- ${it.partNumber ? `${it.partNumber} — ` : ''}${it.description} × ${it.quantity}`);
  const subject = `RFQ ${pr.number}${project ? ` — ${project.projectNumber}` : ''}`;
  const body = [
    `Hello${sup?.contactName ? ` ${sup.contactName}` : ''},`,
    '',
    'Please send us your best price and lead time for:',
    '',
    ...lines,
    '',
    pr.neededBy ? `Needed by: ${pr.neededBy.split('-').reverse().join('/')}` : '',
    `Our reference: ${pr.number}`,
    '',
    'Thank you,',
    'Weiss UK — Logistics',
  ]
    .filter((l, i, a) => !(l === '' && a[i - 1] === ''))
    .join('\n');
  return `mailto:${encodeURIComponent(sup?.email ?? '')}?subject=${encodeURIComponent(subject)}&body=${encodeURIComponent(body)}`;
}

/** Requisições que exigem ação da logística. */
/** Eventos de PO registrada que quem pediu ainda não viu (número verde no menu). */
export const unseenPOEvents = (pr: PurchaseRequisition) => pr.history.filter((h) => h.action === 'po_registered' && h.at > (pr.requesterSeenAt ?? ''));

/** Recusa que quem pediu ainda não viu (número amarelo no menu). */
export const unseenRejection = (pr: PurchaseRequisition) =>
  pr.status === 'rejected' && pr.history.some((h) => h.action === 'rejected' && h.at > (pr.requesterSeenAt ?? ''));

export const needsLogistics = (s: RequisitionStatus) => s === 'submitted' || s === 'quoting' || s === 'quoted' || s === 'partially_ordered';

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

/** Fornecedores sugeridos por item (e cotação que o Office já tenha). */
export interface ItemSupplierInput {
  supplierIds: string[];
  quote?: { supplierId: string; price: number; leadTimeDays?: number; validUntil?: string; quoteRef?: string };
}

/** Quem pode cotar: Office (pede e pode já cotar) e Logística. */
function quoteActor() {
  const user = getCurrentUser();
  if (!user || !(can('requisition.create', user) || can('requisition.process', user))) throw new Error('auth.forbidden');
  return user;
}

function updateItem(id: string, itemId: string, fn: (it: RequisitionItem) => RequisitionItem) {
  const pr = repos.requisitions.getById(id);
  if (!pr) return;
  repos.requisitions.update(id, { items: pr.items.map((it) => (it.id === itemId ? fn(it) : it)) });
}

/** Cotação vai também para o catálogo (oferta do fornecedor para o part number). */
function catalogFor(it: RequisitionItem): CatalogMaterial | undefined {
  if (!it.partNumber.trim()) return undefined;
  const pn = normPN(it.partNumber);
  const found = repos.materials.getAll().find((m) => normPN(m.partNumber) === pn);
  if (found) return found;
  const created: CatalogMaterial = { id: newId('cm'), partNumber: it.partNumber.trim(), description: it.description, unit: 'pc', offers: [] };
  repos.materials.create(created);
  return created;
}
function upsertOffer(m: CatalogMaterial, supplierId: string, patch: Partial<SupplierOffer>) {
  const has = m.offers.some((o) => o.supplierId === supplierId);
  const offers = has ? m.offers.map((o) => (o.supplierId === supplierId ? { ...o, ...patch } : o)) : [...m.offers, { supplierId, quoteStatus: 'not_requested' as const, leadTimeDays: 0, ...patch }];
  repos.materials.update(m.id, { offers });
}
function mirrorQuote(it: RequisitionItem, s: RequisitionSupplier) {
  const m = catalogFor(it);
  if (m) upsertOffer(m, s.supplierId, { quoteStatus: 'received', quotedPrice: s.price, quoteDate: todayISO(), validUntil: s.validUntil, leadTimeDays: s.leadTimeDays ?? 0 });
}
function mirrorRequested(it: RequisitionItem, supplierId: string) {
  const m = catalogFor(it);
  if (m && m.offers.find((o) => o.supplierId === supplierId)?.quoteStatus !== 'received') upsertOffer(m, supplierId, { quoteStatus: 'requested' });
}

/** Fornecedor pelo nome; se não existir, cria um cadastro mínimo (nome + e-mail) — o Office pode indicar fornecedor novo. */
export function ensureSupplier(name: string, email: string): string {
  quoteActor();
  const n = name.trim();
  const found = repos.suppliers.getAll().find((s) => s.name.trim().toLowerCase() === n.toLowerCase());
  if (found) {
    if (email.trim() && !found.email) repos.suppliers.update(found.id, { email: email.trim() });
    return found.id;
  }
  const id = newId('sup');
  repos.suppliers.create({ id, name: n, contactName: '', email: email.trim(), phone: '', notes: 'Added from a purchase request' });
  return id;
}

export const requisitionService = {
  /** Quem pediu abriu a requisição: as novidades (PO registrada) deixam de contar no número verde. */
  markSeenByRequester(id: string): void {
    const user = getCurrentUser();
    const pr = repos.requisitions.getById(id);
    if (!user || !pr || pr.requestedBy !== user.id || (unseenPOEvents(pr).length === 0 && !unseenRejection(pr))) return;
    repos.requisitions.update(id, { requesterSeenAt: nowStamp() });
  },
  /** Office: cria a requisição a partir de materiais "a comprar" de um projeto. */
  create(projectId: string, materialIds: string[], opts: { neededBy?: string; notes: string; items?: Record<string, ItemSupplierInput> }): PurchaseRequisition | undefined {
    const user = assertCan('requisition.create');
    const p = repos.projects.getById(projectId);
    if (!p) return undefined;
    const mats = p.materials.filter((m) => materialIds.includes(m.id) && !m.poId && !m.requisitionId);
    if (!mats.length) return undefined;
    // Fornecedor por item é obrigatório (pelo menos um).
    if (opts.items && mats.some((m) => !(opts.items![m.id]?.supplierIds.length))) throw new Error('process.validation.supplierPerItem');
    const itemOf = (m: { id: string; partNumber: string; description: string; quantity: number }): RequisitionItem => {
      const inp = opts.items?.[m.id];
      const suppliers: RequisitionSupplier[] = (inp?.supplierIds ?? []).map((sid) =>
        inp?.quote && inp.quote.supplierId === sid
          ? { supplierId: sid, price: inp.quote.price, leadTimeDays: inp.quote.leadTimeDays, validUntil: inp.quote.validUntil, quoteRef: inp.quote.quoteRef, quotedAt: nowStamp(), quotedBy: user.id }
          : { supplierId: sid },
      );
      return { id: newId('ri'), materialId: m.id, partNumber: m.partNumber, description: m.description, quantity: m.quantity, suppliers, chosenSupplierId: inp?.quote?.supplierId };
    };
    const pr: PurchaseRequisition = {
      id: newId('rc'),
      number: nextRequisitionNumber(),
      projectId,
      requestedBy: user.id,
      requestedAt: todayISO(),
      neededBy: opts.neededBy || undefined,
      status: 'submitted',
      notes: opts.notes.trim(),
      items: mats.map(itemOf),
      history: [{ at: nowStamp(), userId: user.id, action: 'submitted', note: '' }],
    };
    repos.requisitions.create(pr);
    // Cotação já mandada pelo Office vai também para o catálogo.
    for (const it of pr.items) for (const sup of it.suppliers ?? []) if (sup.price !== undefined) mirrorQuote(it, sup);
    const ids = new Set(mats.map((m) => m.id));
    repos.projects.update(p.id, { materials: p.materials.map((m) => (ids.has(m.id) ? { ...m, requisitionId: pr.id, status: 'requested' as const } : m)) });
    return pr;
  },

  /** Acrescenta um fornecedor a um item (Office ou Logística). */
  addSupplier(id: string, itemId: string, supplierId: string): void {
    quoteActor();
    updateItem(id, itemId, (it) => ((it.suppliers ?? []).some((s) => s.supplierId === supplierId) ? it : { ...it, suppliers: [...(it.suppliers ?? []), { supplierId }] }));
  },

  /** RFQ enviado por e-mail a um fornecedor (todos os itens dele no pedido). */
  markRfqSent(id: string, supplierId: string): void {
    const user = quoteActor();
    const pr = repos.requisitions.getById(id);
    if (!pr) return;
    const at = nowStamp();
    repos.requisitions.update(id, {
      status: pr.status === 'submitted' ? 'quoting' : pr.status,
      items: pr.items.map((it) => ({ ...it, suppliers: (it.suppliers ?? []).map((s) => (s.supplierId === supplierId && !s.rfqSentAt ? { ...s, rfqSentAt: at } : s)) })),
    });
    for (const it of pr.items) if ((it.suppliers ?? []).some((s) => s.supplierId === supplierId)) mirrorRequested(it, supplierId);
    addEvent(id, user.id, 'rfq_sent', repos.suppliers.getById(supplierId)?.name ?? '');
  },

  /** Cotação recebida de um fornecedor para um item (vai também para o catálogo). */
  recordQuote(id: string, itemId: string, supplierId: string, q: { price: number; leadTimeDays?: number; validUntil?: string; quoteRef?: string }): void {
    const user = quoteActor();
    if (!(q.price >= 0)) throw new Error('process.validation.price');
    let item: RequisitionItem | undefined;
    updateItem(id, itemId, (it) => {
      const suppliers = (it.suppliers ?? []).some((s) => s.supplierId === supplierId) ? it.suppliers! : [...(it.suppliers ?? []), { supplierId }];
      item = {
        ...it,
        suppliers: suppliers.map((s) => (s.supplierId === supplierId ? { ...s, price: q.price, leadTimeDays: q.leadTimeDays, validUntil: q.validUntil || undefined, quoteRef: q.quoteRef?.trim() || undefined, quotedAt: nowStamp(), quotedBy: user.id } : s)),
      };
      // Primeira cotação do item: já fica escolhida (dá para trocar).
      if (!item.chosenSupplierId) item.chosenSupplierId = supplierId;
      return item;
    });
    const sup = item?.suppliers?.find((s) => s.supplierId === supplierId);
    if (item && sup) mirrorQuote(item, sup);
    const pr = repos.requisitions.getById(id);
    const it = pr?.items.find((x) => x.id === itemId);
    addEvent(id, user.id, 'quote_received', `${repos.suppliers.getById(supplierId)?.name ?? ''} · ${it?.partNumber || it?.description || ''} · ${q.price}`);
  },

  /** Escolhe o fornecedor do item (vai para a PO). */
  chooseSupplier(id: string, itemId: string, supplierId: string): void {
    const user = quoteActor();
    updateItem(id, itemId, (it) => ({ ...it, chosenSupplierId: supplierId }));
    const it = repos.requisitions.getById(id)?.items.find((x) => x.id === itemId);
    addEvent(id, user.id, 'supplier_chosen', `${it?.partNumber || it?.description || ''} → ${repos.suppliers.getById(supplierId)?.name ?? ''}`);
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
    // Depois que a Logística registrou PO para algum item, a requisição é dela: o Office não cancela (Master pode).
    const project = repos.projects.getById(pr.projectId);
    const itemIds = new Set(pr.items.map((i) => i.materialId));
    const anyOrdered = !!project?.materials.some((m) => itemIds.has(m.id) && m.poId);
    if (anyOrdered && user.role !== 'master') throw new Error('auth.lockedByLogistics');
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
