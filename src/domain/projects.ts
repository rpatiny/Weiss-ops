/**
 * Ficha do projeto: junta numa visão só o que está espalhado pelos módulos
 * (cotação do spindle, PO do cliente, alocações no cronograma, requisições,
 * POs de compra e GRs dos materiais). Tudo derivado — nada é persistido.
 */
import { materialViews, type MaterialView } from './schedule';
import { poTotal, type ProjectReadiness } from './purchasing';
import { effectiveStatus, receivedQty, requisitionItemViews } from './requisitions';
import { todayISO } from '@/lib/dates';
import type {
  Employee,
  Project,
  ProjectAssignment,
  PurchaseOrder,
  PurchaseRequisition,
  RequisitionStatus,
  SpindleUnit,
} from '@/types/models';

export type ProductionPhase = 'unscheduled' | 'scheduled' | 'in_production' | 'finished';

export interface MaterialTrail extends MaterialView {
  requisition?: PurchaseRequisition;
  /** Data do último GR da linha (quando recebido). */
  receivedOn?: string;
  receivedQty: number;
}

export type TimelineKind = 'received' | 'quote' | 'customer_po' | 'requisition' | 'purchase_po' | 'goods_receipt' | 'production_start' | 'production_end' | 'delivery';

export interface TimelineEvent {
  date: string;
  kind: TimelineKind;
  /** Texto principal (nº do documento, nomes…); já pronto para exibir. */
  ref: string;
  /** Valor monetário, quando houver. */
  amount?: number;
  /** Evento no futuro (planejado/previsto). */
  planned: boolean;
}

export interface ProjectDossier {
  project: Project;
  spindle?: SpindleUnit;
  customerPO?: PurchaseOrder;
  customerPOTotal?: number;
  assignments: ProjectAssignment[];
  team: Employee[];
  start?: string;
  end?: string;
  phase: ProductionPhase;
  materials: MaterialTrail[];
  pending: MaterialTrail[];
  requisitions: { req: PurchaseRequisition; status: RequisitionStatus }[];
  purchasePOs: PurchaseOrder[];
  readiness: ProjectReadiness;
  timeline: TimelineEvent[];
}

export interface DossierContext {
  employeesById: ReadonlyMap<string, Employee>;
  spindlesById: ReadonlyMap<string, SpindleUnit>;
  poById: ReadonlyMap<string, PurchaseOrder>;
  requisitions: readonly PurchaseRequisition[];
  assignmentsByProject: ReadonlyMap<string, ProjectAssignment[]>;
  readinessOf: (p: Project) => ProjectReadiness;
}

export function buildDossier(project: Project, ctx: DossierContext, today = todayISO()): ProjectDossier {
  const spindle = project.spindleId ? ctx.spindlesById.get(project.spindleId) : undefined;
  const customerPO = project.poId ? ctx.poById.get(project.poId) : undefined;

  const assignments = [...(ctx.assignmentsByProject.get(project.id) ?? [])].sort((a, b) => a.startDate.localeCompare(b.startDate));
  const start = assignments[0]?.startDate;
  const end = assignments.reduce<string | undefined>((m, a) => (!m || a.endDate > m ? a.endDate : m), undefined);
  const team = [...new Set(assignments.map((a) => a.employeeId))].map((id) => ctx.employeesById.get(id)).filter((e): e is Employee => !!e);

  const phase: ProductionPhase =
    project.status === 'completed' || (end && end < today && project.status !== 'planned')
      ? 'finished'
      : !start
        ? 'unscheduled'
        : start > today
          ? 'scheduled'
          : 'in_production';

  const reqs = ctx.requisitions.filter((r) => r.projectId === project.id).sort((a, b) => a.requestedAt.localeCompare(b.requestedAt));
  const reqById = new Map(reqs.map((r) => [r.id, r]));

  const materials: MaterialTrail[] = materialViews(project, ctx.poById, start, today).map((v) => {
    const receipts = v.line?.receipts ?? [];
    const receivedOn = receipts.reduce<string | undefined>((m, r) => (!m || r.date > m ? r.date : m), undefined);
    return { ...v, requisition: v.material.requisitionId ? reqById.get(v.material.requisitionId) : undefined, receivedOn, receivedQty: v.line ? receivedQty(v.line) : 0 };
  });
  const pending = materials.filter((m) => m.status !== 'received');

  const purchasePOs = [...new Map(materials.filter((m) => m.po && m.po.kind === 'purchase').map((m) => [m.po!.id, m.po!])).values()].sort((a, b) =>
    a.orderDate.localeCompare(b.orderDate),
  );

  // ── Linha do tempo ──
  const ev: TimelineEvent[] = [];
  const push = (date: string | undefined, kind: TimelineKind, ref: string, amount?: number) => date && ev.push({ date, kind, ref, amount, planned: date > today });
  if (spindle) {
    push(spindle.receivedDate, 'received', `${spindle.manufacturer} ${spindle.model} · ${spindle.serialNumber}`);
    push(spindle.quoteDate, 'quote', spindle.quoteNumber, spindle.quotedValue || undefined);
  }
  if (customerPO) push(customerPO.orderDate, 'customer_po', customerPO.poNumber, poTotal(customerPO));
  for (const r of reqs) push(r.requestedAt, 'requisition', r.number);
  for (const po of purchasePOs) push(po.orderDate, 'purchase_po', `${po.poNumber} · ${po.customerOrVendor}`, poTotal(po));
  const grSeen = new Set<string>();
  for (const m of materials)
    for (const r of m.line?.receipts ?? []) {
      if (grSeen.has(r.id)) continue;
      grSeen.add(r.id);
      push(r.date, 'goods_receipt', `${r.grNumber} · ${m.material.partNumber || m.material.description}`);
    }
  const names = team.map((e) => e.name).join(', ');
  push(start, 'production_start', names);
  push(end, 'production_end', names);
  if (spindle?.deliveryDate) push(spindle.deliveryDate, 'delivery', spindle.serialNumber, spindle.invoicedValue ?? spindle.quotedValue);

  const order: TimelineKind[] = ['received', 'quote', 'customer_po', 'requisition', 'purchase_po', 'goods_receipt', 'production_start', 'production_end', 'delivery'];
  ev.sort((a, b) => a.date.localeCompare(b.date) || order.indexOf(a.kind) - order.indexOf(b.kind));

  return {
    project,
    spindle,
    customerPO,
    customerPOTotal: customerPO ? poTotal(customerPO) : undefined,
    assignments,
    team,
    start,
    end,
    phase,
    materials,
    pending,
    requisitions: reqs.map((req) => ({ req, status: effectiveStatus(req, requisitionItemViews(req, project, ctx.poById)) })),
    purchasePOs,
    readiness: ctx.readinessOf(project),
    timeline: ev,
  };
}

/** Texto de busca da ficha (nº, cliente, descrição, spindle, documentos). */
export function dossierSearchText(d: ProjectDossier): string {
  return [
    d.project.projectNumber,
    d.project.customer,
    d.project.description,
    d.spindle?.serialNumber,
    d.spindle?.model,
    d.spindle?.quoteNumber,
    d.customerPO?.poNumber,
    ...d.purchasePOs.map((p) => p.poNumber),
    ...d.requisitions.map((r) => r.req.number),
    ...d.team.map((e) => e.name),
    ...d.materials.map((m) => m.material.partNumber),
  ]
    .filter(Boolean)
    .join(' ')
    .toLowerCase();
}
