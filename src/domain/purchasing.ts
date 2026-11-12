/**
 * Domínio de Compras: Ordens de Compra (cliente/fornecedor), fornecedores,
 * catálogo de materiais com cotações, demanda entre projetos e prontidão para iniciar.
 */
import { assertCan } from '@/app/session';
import { repos } from '@/data/db';
import type { TranslationKey } from '@/i18n/types';
import { addDays, todayISO } from '@/lib/dates';
import { newId } from '@/lib/id';
import type {
  CatalogMaterial,
  POLineItem,
  PurchaseOrder,
  Project,
  ProjectAssignment,
  ProjectMaterial,
  Supplier,
  SupplierOffer,
} from '@/types/models';
import { materialViews, type MaterialView } from './schedule';

/** Chave de comparação de part numbers (ignora caixa e espaços). */
export const normPN = (pn: string) => pn.trim().toUpperCase().replace(/\s+/g, '');

// ───────────── Totais, atrasos e status ─────────────

export const lineTotal = (l: Pick<POLineItem, 'quantity' | 'unitPrice'>) => (Number(l.quantity) || 0) * (Number(l.unitPrice) || 0);

export const poTotal = (po: Pick<PurchaseOrder, 'lines'>) => po.lines.filter((l) => l.status !== 'canceled').reduce((s, l) => s + lineTotal(l), 0);

export const isLineLate = (l: POLineItem, today = todayISO()) =>
  l.status !== 'delivered' && l.status !== 'canceled' && !!l.expectedDeliveryDate && l.expectedDeliveryDate < today;

export const isPOActive = (po: PurchaseOrder) => po.status === 'open' || po.status === 'partial';

/** Status sugerido a partir das linhas (faturada/cancelada são decisões manuais e são preservadas). */
export function derivePOStatus(current: PurchaseOrder['status'], lines: POLineItem[]): PurchaseOrder['status'] {
  if (current === 'invoiced' || current === 'canceled') return current;
  const active = lines.filter((l) => l.status !== 'canceled');
  if (!active.length) return 'open';
  if (active.every((l) => l.status === 'delivered')) return 'delivered';
  if (active.some((l) => l.status === 'delivered' || l.status === 'partial')) return 'partial';
  return 'open';
}

// ───────────── Último valor pago ─────────────

export interface PurchaseRecord {
  price: number;
  date: string;
  po: PurchaseOrder;
  line: POLineItem;
}

/** Compras (POs de compra não canceladas) de um part number, da mais recente para a mais antiga. */
export function purchaseHistory(partNumber: string, pos: readonly PurchaseOrder[], supplierId?: string): PurchaseRecord[] {
  const key = normPN(partNumber);
  const out: PurchaseRecord[] = [];
  for (const po of pos) {
    if (po.kind !== 'purchase' || po.status === 'canceled') continue;
    if (supplierId && po.supplierId !== supplierId) continue;
    for (const line of po.lines)
      if (line.status !== 'canceled' && line.unitPrice > 0 && normPN(line.partNumber) === key) out.push({ price: line.unitPrice, date: po.orderDate, po, line });
  }
  return out.sort((a, b) => b.date.localeCompare(a.date));
}

export const lastPurchase = (partNumber: string, pos: readonly PurchaseOrder[], supplierId?: string) => purchaseHistory(partNumber, pos, supplierId)[0];

// ───────────── Cotações / ofertas ─────────────

export type QuoteState = 'quoted' | 'requested' | 'not_quoted';

export const isQuoteValid = (o: SupplierOffer, today = todayISO()) =>
  o.quoteStatus === 'received' && o.quotedPrice !== undefined && (!o.validUntil || o.validUntil >= today);

/** Situação de cotação do material: alguma cotação válida > alguma solicitada > nenhuma. */
export function quoteState(cat: CatalogMaterial | undefined, today = todayISO()): QuoteState {
  if (!cat) return 'not_quoted';
  if (cat.offers.some((o) => isQuoteValid(o, today))) return 'quoted';
  if (cat.offers.some((o) => o.quoteStatus === 'requested' || o.quoteStatus === 'received')) return 'requested';
  return 'not_quoted';
}

export interface OfferView {
  offer: SupplierOffer;
  supplier?: Supplier;
  last?: PurchaseRecord;
  quoteValid: boolean;
  /** Preço de referência: cotação válida, senão último valor pago a este fornecedor. */
  refPrice?: number;
  /** Data possível de entrega se o pedido for feito hoje. */
  possibleDate: string;
}

export function offerViews(cat: CatalogMaterial, suppliersById: ReadonlyMap<string, Supplier>, pos: readonly PurchaseOrder[], today = todayISO()): OfferView[] {
  return cat.offers.map((offer) => {
    const last = lastPurchase(cat.partNumber, pos, offer.supplierId);
    const quoteValid = isQuoteValid(offer, today);
    return {
      offer,
      supplier: suppliersById.get(offer.supplierId),
      last,
      quoteValid,
      refPrice: quoteValid ? offer.quotedPrice : last?.price,
      possibleDate: addDays(today, Math.max(0, offer.leadTimeDays || 0)),
    };
  });
}

/** Melhor oferta: menor preço de referência; empate/sem preço → menor prazo. */
export function bestOffer(views: readonly OfferView[]): OfferView | undefined {
  return [...views].sort((a, b) => {
    const pa = a.refPrice ?? Infinity;
    const pb = b.refPrice ?? Infinity;
    return pa - pb || a.offer.leadTimeDays - b.offer.leadTimeDays;
  })[0];
}

/** Oferta mais rápida (para estimar a data possível de chegada). */
export const fastestOffer = (views: readonly OfferView[]) => [...views].sort((a, b) => a.offer.leadTimeDays - b.offer.leadTimeDays)[0];

// ───────────── Demanda entre projetos ─────────────

export const isProjectActive = (p: Project) => p.status === 'planned' || p.status === 'in_progress';

/** Início do projeto = primeira alocação no cronograma. */
export function projectStarts(assignments: readonly ProjectAssignment[]): Map<string, string> {
  const m = new Map<string, string>();
  for (const a of assignments) if (!m.has(a.projectId) || a.startDate < m.get(a.projectId)!) m.set(a.projectId, a.startDate);
  return m;
}

export interface DemandItem {
  project: Project;
  material: ProjectMaterial;
  view: MaterialView;
  start?: string;
}

/** Demanda por part number, considerando apenas projetos ativos (planejados/em andamento). */
export function demandByPartNumber(
  projects: readonly Project[],
  starts: ReadonlyMap<string, string>,
  poById: ReadonlyMap<string, PurchaseOrder>,
  today = todayISO(),
): Map<string, DemandItem[]> {
  const map = new Map<string, DemandItem[]>();
  for (const project of projects) {
    if (!isProjectActive(project)) continue;
    const start = starts.get(project.id);
    const views = materialViews(project, poById, start, today);
    for (const view of views) {
      const key = normPN(view.material.partNumber || view.material.description);
      map.set(key, [...(map.get(key) ?? []), { project, material: view.material, view, start }]);
    }
  }
  return map;
}

/** Outros projetos ativos que usam o mesmo material. */
export function sharedWith(projectId: string, partNumber: string, demand: ReadonlyMap<string, DemandItem[]>): DemandItem[] {
  return (demand.get(normPN(partNumber)) ?? []).filter((d) => d.project.id !== projectId);
}

// ───────────── Prontidão ("checklist para começar") ─────────────

export type ItemReadiness = 'ok' | 'awaiting' | 'to_buy' | 'risk';
export type Readiness = 'ready' | 'awaiting' | 'to_buy' | 'at_risk';

export interface ReadinessItem {
  view: MaterialView;
  state: ItemReadiness;
  quote: QuoteState;
  /** Previsão de chegada: linha da PO ou, se a comprar, hoje + prazo do fornecedor mais rápido. */
  eta?: string;
  shared: DemandItem[];
}

export interface ProjectReadiness {
  status: Readiness;
  items: ReadinessItem[];
  ready: number;
  total: number;
  start?: string;
}

export function projectReadiness(
  project: Project,
  start: string | undefined,
  poById: ReadonlyMap<string, PurchaseOrder>,
  catalogByPN: ReadonlyMap<string, CatalogMaterial>,
  suppliersById: ReadonlyMap<string, Supplier>,
  pos: readonly PurchaseOrder[],
  demand: ReadonlyMap<string, DemandItem[]>,
  today = todayISO(),
): ProjectReadiness {
  const views = materialViews(project, poById, start, today);
  const items: ReadinessItem[] = views.map((view) => {
    const cat = catalogByPN.get(normPN(view.material.partNumber));
    const quote = quoteState(cat, today);
    const need = view.material.neededBy ?? start;
    const shared = sharedWith(project.id, view.material.partNumber || view.material.description, demand);
    if (view.status === 'received') return { view, state: 'ok', quote, shared };
    if (view.status === 'ordered') {
      const eta = view.expectedDate;
      const risk = view.late || (!!eta && !!need && eta > need);
      return { view, state: risk ? 'risk' : 'awaiting', quote, eta, shared };
    }
    // a comprar ou requisitado (ainda sem PO)
    const fastest = cat ? fastestOffer(offerViews(cat, suppliersById, pos, today)) : undefined;
    const eta = fastest?.possibleDate;
    const risk = !!need && (eta ? eta > need : need <= addDays(today, 7));
    return { view, state: risk ? 'risk' : 'to_buy', quote, eta, shared };
  });
  const status: Readiness = items.some((i) => i.state === 'risk')
    ? 'at_risk'
    : items.some((i) => i.state === 'to_buy')
      ? 'to_buy'
      : items.some((i) => i.state === 'awaiting')
        ? 'awaiting'
        : 'ready';
  return { status, items, ready: items.filter((i) => i.state === 'ok').length, total: items.length, start };
}

// ───────────── Validação ─────────────

export type Errors<T> = Partial<Record<keyof T, TranslationKey>>;
export type PODraft = Omit<PurchaseOrder, 'id'>;

export function validatePO(d: PODraft, all: readonly PurchaseOrder[], selfId?: string): Errors<PODraft> & { linesInvalid?: TranslationKey } {
  const e: Errors<PODraft> & { linesInvalid?: TranslationKey } = {};
  if (!d.poNumber.trim()) e.poNumber = 'purchasing.validation.numberRequired';
  else if (all.some((p) => p.id !== selfId && p.poNumber.trim().toLowerCase() === d.poNumber.trim().toLowerCase())) e.poNumber = 'purchasing.validation.numberDuplicate';
  if (!d.customerOrVendor.trim()) e.customerOrVendor = 'purchasing.validation.partyRequired';
  if (!d.orderDate) e.orderDate = 'purchasing.validation.dateRequired';
  if (d.lines.some((l) => !l.description.trim() || !(l.quantity > 0) || l.unitPrice < 0 || !l.expectedDeliveryDate)) e.linesInvalid = 'purchasing.validation.linesInvalid';
  return e;
}

export function nextPurchaseNumber(all: readonly PurchaseOrder[]): string {
  const used = new Set(all.map((p) => p.poNumber));
  let n = all.filter((p) => p.poNumber.startsWith('PC-')).length + 1;
  let num = `PC-${String(n).padStart(5, '0')}`;
  while (used.has(num)) num = `PC-${String(++n).padStart(5, '0')}`;
  return num;
}

export const emptyLine = (lineNumber: number, expected = addDays(todayISO(), 7)): POLineItem => ({
  id: newId('pol'),
  lineNumber,
  partNumber: '',
  description: '',
  quantity: 1,
  unitPrice: 0,
  expectedDeliveryDate: expected,
  status: 'open',
});

// ───────────── Comandos ─────────────

export const poService = {
  save(draft: PODraft, id?: string): PurchaseOrder {
    assertCan('po.edit');
    const lines = draft.lines.map((l, i) => ({
      ...l,
      lineNumber: l.lineNumber || i + 1,
      partNumber: l.partNumber.trim(),
      description: l.description.trim(),
      quantity: Number(l.quantity) || 0,
      unitPrice: Number(l.unitPrice) || 0,
      actualDeliveryDate: l.status === 'delivered' ? l.actualDeliveryDate || todayISO() : l.actualDeliveryDate || undefined,
    }));
    const supplier = draft.supplierId ? repos.suppliers.getById(draft.supplierId) : undefined;
    const clean: PODraft = {
      ...draft,
      poNumber: draft.poNumber.trim(),
      customerOrVendor: supplier && draft.kind === 'purchase' ? supplier.name : draft.customerOrVendor.trim(),
      supplierId: draft.kind === 'purchase' ? draft.supplierId : undefined,
      lines,
      status: derivePOStatus(draft.status, lines),
    };
    return id ? repos.purchaseOrders.update(id, clean) : repos.purchaseOrders.create({ id: newId('po'), ...clean });
  },

  /** Exclui a PO e desfaz vínculos (projetos, materiais e spindles voltam a "sem PO"). */
  remove(id: string): void {
    assertCan('po.edit');
    repos.projects.replaceAll(
      repos.projects.getAll().map((p) => ({
        ...p,
        poId: p.poId === id ? undefined : p.poId,
        materials: p.materials.map((m) => (m.poId === id ? { ...m, poId: undefined, poLineId: undefined, status: 'to_buy' as const } : m)),
      })),
    );
    repos.spindles.replaceAll(repos.spindles.getAll().map((s) => (s.poId === id ? { ...s, poId: undefined } : s)));
    repos.purchaseOrders.remove(id);
  },
};

export type SupplierDraft = Omit<Supplier, 'id'>;

export const supplierService = {
  save(d: SupplierDraft, id?: string): Supplier {
    assertCan('suppliers.edit');
    const clean = { ...d, name: d.name.trim(), contactName: d.contactName.trim(), email: d.email.trim(), phone: d.phone.trim(), notes: d.notes.trim() };
    if (id) {
      const updated = repos.suppliers.update(id, clean);
      // Mantém o nome exibido das POs de compra em sincronia.
      repos.purchaseOrders.replaceAll(repos.purchaseOrders.getAll().map((p) => (p.supplierId === id ? { ...p, customerOrVendor: updated.name } : p)));
      return updated;
    }
    return repos.suppliers.create({ id: newId('sup'), ...clean });
  },
  /** Remove o fornecedor e suas ofertas no catálogo; POs antigas mantêm o nome (histórico). */
  remove(id: string): void {
    assertCan('suppliers.edit');
    repos.materials.replaceAll(repos.materials.getAll().map((m) => ({ ...m, offers: m.offers.filter((o) => o.supplierId !== id) })));
    repos.purchaseOrders.replaceAll(repos.purchaseOrders.getAll().map((p) => (p.supplierId === id ? { ...p, supplierId: undefined } : p)));
    repos.suppliers.remove(id);
  },
};

export type CatalogDraft = Omit<CatalogMaterial, 'id'>;

export const catalogService = {
  save(d: CatalogDraft, id?: string): CatalogMaterial {
    assertCan('catalog.edit');
    const clean: CatalogDraft = {
      ...d,
      partNumber: d.partNumber.trim(),
      description: d.description.trim(),
      unit: d.unit.trim() || 'un',
      offers: d.offers.filter((o) => o.supplierId).map((o) => ({ ...o, leadTimeDays: Math.max(0, Math.round(o.leadTimeDays || 0)) })),
    };
    return id ? repos.materials.update(id, clean) : repos.materials.create({ id: newId('cm'), ...clean });
  },
  remove(id: string): void {
    assertCan('catalog.edit');
    repos.materials.remove(id);
  },
};

export function validateCatalog(d: CatalogDraft, all: readonly CatalogMaterial[], selfId?: string): Errors<CatalogDraft> {
  const e: Errors<CatalogDraft> = {};
  if (!d.partNumber.trim()) e.partNumber = 'purchasing.validation.partNumberRequired';
  else if (all.some((m) => m.id !== selfId && normPN(m.partNumber) === normPN(d.partNumber))) e.partNumber = 'purchasing.validation.partNumberDuplicate';
  if (!d.description.trim()) e.description = 'purchasing.validation.descriptionRequired';
  return e;
}
