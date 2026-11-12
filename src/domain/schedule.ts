/**
 * Domínio do Cronograma de Projetos (Gantt por colaborador):
 * períodos visíveis, dias úteis, raias (lanes), conflitos, bloqueio por férias,
 * movimentação/redimensionamento e materiais (integração com Ordens de Compra).
 */
import { repos } from '@/data/db';
import type { TranslationKey } from '@/i18n/types';
import {
  addBusinessDays,
  addDays,
  addMonths,
  businessDaysBetween,
  dateRange,
  diffDays,
  endOfMonth,
  rangesOverlap,
  snapBackward,
  snapForward,
  startOfMonth,
  startOfWeek,
  todayISO,
} from '@/lib/dates';
import { newId } from '@/lib/id';
import { derivePOStatus, nextPurchaseNumber } from './purchasing';
import type {
  Absence,
  Employee,
  MaterialStatus,
  POLineItem,
  Project,
  ProjectAssignment,
  ProjectMaterial,
  PurchaseOrder,
} from '@/types/models';

export type ScheduleView = 'week' | 'biweekly' | 'month';
export type Errors<T> = Partial<Record<keyof T, TranslationKey>>;

export const PROJECT_COLORS = [
  '#2563eb', '#7c3aed', '#d97706', '#16a34a', '#db2777', '#0891b2',
  '#65a30d', '#ea580c', '#4f46e5', '#0d9488', '#dc2626', '#64748b',
];

// ───────────── Período visível ─────────────

export function getVisibleDays(view: ScheduleView, anchor: string): { start: string; end: string; days: string[] } {
  if (view === 'month') {
    const start = startOfMonth(anchor);
    const end = endOfMonth(anchor);
    return { start, end, days: dateRange(start, diffDays(start, end) + 1) };
  }
  const start = startOfWeek(anchor);
  const count = view === 'week' ? 7 : 14;
  return { start, end: addDays(start, count - 1), days: dateRange(start, count) };
}

export function shiftAnchor(view: ScheduleView, anchor: string, dir: 1 | -1): string {
  if (view === 'month') return addMonths(startOfMonth(anchor), dir);
  return addDays(anchor, (view === 'week' ? 7 : 14) * dir);
}

// ───────────── Raias (sobreposição visual) ─────────────

/**
 * Distribui barras sobrepostas da mesma linha em raias (algoritmo guloso por início).
 * Retorna assignmentId → índice da raia e o total de raias.
 */
export function computeLanes(items: readonly ProjectAssignment[]): { lane: Map<string, number>; count: number } {
  const sorted = [...items].sort((a, b) => a.startDate.localeCompare(b.startDate) || a.endDate.localeCompare(b.endDate));
  const laneEnds: string[] = [];
  const lane = new Map<string, number>();
  for (const it of sorted) {
    let idx = laneEnds.findIndex((end) => end < it.startDate);
    if (idx === -1) {
      idx = laneEnds.length;
      laneEnds.push(it.endDate);
    } else laneEnds[idx] = it.endDate;
    lane.set(it.id, idx);
  }
  return { lane, count: Math.max(1, laneEnds.length) };
}

// ───────────── Conflitos & bloqueios ─────────────

/** Mesmo colaborador com duas alocações sobrepostas (dias úteis em comum). */
export function findConflicts(assignments: readonly ProjectAssignment[], projects: ReadonlyMap<string, Project>): Map<string, string[]> {
  const result = new Map<string, string[]>();
  const active = assignments.filter((a) => projects.get(a.projectId)?.status !== 'canceled');
  const byEmp = new Map<string, ProjectAssignment[]>();
  for (const a of active) byEmp.set(a.employeeId, [...(byEmp.get(a.employeeId) ?? []), a]);
  for (const list of byEmp.values()) {
    for (let i = 0; i < list.length; i++)
      for (let j = i + 1; j < list.length; j++) {
        const a = list[i]!;
        const b = list[j]!;
        if (rangesOverlap(a.startDate, a.endDate, b.startDate, b.endDate)) {
          result.set(a.id, [...(result.get(a.id) ?? []), b.id]);
          result.set(b.id, [...(result.get(b.id) ?? []), a.id]);
        }
      }
  }
  return result;
}

/** Ausências (férias etc.) do colaborador que cruzam o período. */
export function absencesOverlapping(absences: readonly Absence[], employeeId: string, start: string, end: string): Absence[] {
  return absences.filter((x) => x.employeeId === employeeId && rangesOverlap(x.startDate, x.endDate, start, end));
}

export type PlacementError = 'absence' | 'inactive' | 'order';

/** Valida se uma alocação pode ocupar o período (férias bloqueiam; inativos não recebem). */
export function checkPlacement(
  employee: Employee | undefined,
  start: string,
  end: string,
  absences: readonly Absence[],
  originalEmployeeId?: string,
): PlacementError | null {
  if (end < start) return 'order';
  if (!employee || (employee.status === 'inactive' && employee.id !== originalEmployeeId)) return 'inactive';
  if (absencesOverlapping(absences, employee.id, start, end).length) return 'absence';
  return null;
}

// ───────────── Geometria do arraste ─────────────

export type DragMode = 'move' | 'resize-start' | 'resize-end';

/**
 * Calcula o novo período a partir do deslocamento em dias de calendário.
 * - move: mantém a duração em DIAS ÚTEIS; início cai sempre em dia útil.
 * - resize: a borda arrastada encaixa no dia útil mais próximo dentro da barra.
 */
export function applyDrag(mode: DragMode, start: string, end: string, deltaDays: number): { start: string; end: string } {
  if (mode === 'move') {
    const dur = businessDaysBetween(start, end);
    const target = addDays(start, deltaDays);
    const s = snapForward(target);
    return { start: s, end: addBusinessDays(s, Math.max(0, dur - 1)) };
  }
  if (mode === 'resize-end') {
    const e = snapBackward(addDays(end, deltaDays));
    return { start, end: e < start ? start : e };
  }
  const s = snapForward(addDays(start, deltaDays));
  return { start: s > end ? end : s, end };
}

// ───────────── Materiais ─────────────

export interface MaterialView {
  material: ProjectMaterial;
  status: MaterialStatus;
  po?: PurchaseOrder;
  line?: POLineItem;
  expectedDate?: string;
  /** Comprado, não chegou e a data prevista já passou. */
  late: boolean;
  /** Ainda não disponível e o projeto (ou `neededBy`) começa antes da chegada prevista. */
  atRisk: boolean;
}

/** Status efetivo: derivado da linha de PO quando vinculada. */
export function materialStatus(m: ProjectMaterial, poById: ReadonlyMap<string, PurchaseOrder>): { status: MaterialStatus; po?: PurchaseOrder; line?: POLineItem } {
  const po = m.poId ? poById.get(m.poId) : undefined;
  const line = po?.lines.find((l) => l.id === m.poLineId);
  if (!po || !line) return { status: m.status };
  if (line.status === 'canceled' || po.status === 'canceled') return { status: 'to_buy', po, line };
  if (line.status === 'delivered') return { status: 'received', po, line };
  return { status: 'ordered', po, line };
}

export function materialViews(project: Project, poById: ReadonlyMap<string, PurchaseOrder>, projectStart?: string, today = todayISO()): MaterialView[] {
  return project.materials.map((material) => {
    const { status, po, line } = materialStatus(material, poById);
    const expectedDate = line?.expectedDeliveryDate;
    const neededBy = material.neededBy ?? projectStart;
    const late = status === 'ordered' && !!expectedDate && expectedDate < today;
    const atRisk = status !== 'received' && !!neededBy && (status === 'to_buy' ? neededBy <= addDays(today, 7) : !!expectedDate && expectedDate > neededBy);
    return { material, status, po, line, expectedDate, late, atRisk };
  });
}

export interface MaterialSummary {
  total: number;
  toBuy: number;
  ordered: number;
  late: number;
  received: number;
}

export function summarizeMaterials(views: readonly MaterialView[]): MaterialSummary {
  return {
    total: views.length,
    toBuy: views.filter((v) => v.status === 'to_buy').length,
    ordered: views.filter((v) => v.status === 'ordered').length,
    late: views.filter((v) => v.late).length,
    received: views.filter((v) => v.status === 'received').length,
  };
}

// ───────────── Validação ─────────────

export type ProjectDraft = Omit<Project, 'id' | 'materials'>;
export type AssignmentDraft = Omit<ProjectAssignment, 'id' | 'projectId'>;

export function validateProject(d: ProjectDraft, all: readonly Project[], selfId?: string): Errors<ProjectDraft> {
  const e: Errors<ProjectDraft> = {};
  if (!d.projectNumber.trim()) e.projectNumber = 'calendar.validation.numberRequired';
  else if (all.some((p) => p.id !== selfId && p.projectNumber.trim().toLowerCase() === d.projectNumber.trim().toLowerCase()))
    e.projectNumber = 'calendar.validation.numberDuplicate';
  if (!d.customer.trim()) e.customer = 'calendar.validation.customerRequired';
  return e;
}

export function nextProjectNumber(all: readonly Project[], today = todayISO()): string {
  const prefix = `PRJ-${today.slice(2, 4)}${today.slice(5, 7)}-`;
  const max = all
    .map((p) => p.projectNumber)
    .filter((n) => n.startsWith(prefix))
    .map((n) => Number(n.slice(prefix.length)) || 0)
    .reduce((a, b) => Math.max(a, b), 0);
  return `${prefix}${String(max + 1).padStart(3, '0')}`;
}

export function nextProjectColor(all: readonly Project[]): string {
  const counts = new Map(PROJECT_COLORS.map((c) => [c, 0]));
  for (const p of all) if (counts.has(p.color)) counts.set(p.color, counts.get(p.color)! + 1);
  return [...counts.entries()].sort((a, b) => a[1] - b[1])[0]![0];
}

// ───────────── Comandos ─────────────

export const scheduleService = {
  createProject(draft: ProjectDraft, firstAssignment?: AssignmentDraft): Project {
    const project = repos.projects.create({ id: newId('prj'), ...draft, projectNumber: draft.projectNumber.trim(), customer: draft.customer.trim(), materials: [] });
    if (firstAssignment) scheduleService.addAssignment(project.id, firstAssignment);
    return project;
  },
  updateProject(id: string, draft: ProjectDraft): Project {
    return repos.projects.update(id, { ...draft, projectNumber: draft.projectNumber.trim(), customer: draft.customer.trim() });
  },
  removeProject(id: string): void {
    repos.assignments.replaceAll(repos.assignments.getAll().filter((a) => a.projectId !== id));
    repos.projects.remove(id);
  },

  addAssignment(projectId: string, d: AssignmentDraft): ProjectAssignment {
    return repos.assignments.create({ id: newId('asg'), projectId, employeeId: d.employeeId, startDate: snapForward(d.startDate), endDate: snapBackward(d.endDate) });
  },
  updateAssignment(id: string, patch: Partial<AssignmentDraft>): ProjectAssignment {
    return repos.assignments.update(id, patch);
  },
  removeAssignment(id: string): void {
    repos.assignments.remove(id);
  },

  // Materiais
  upsertMaterial(projectId: string, material: Omit<ProjectMaterial, 'id'> & { id?: string }): void {
    const p = repos.projects.getById(projectId);
    if (!p) return;
    const m: ProjectMaterial = { ...material, id: material.id ?? newId('mat') };
    const exists = p.materials.some((x) => x.id === m.id);
    repos.projects.update(projectId, { materials: exists ? p.materials.map((x) => (x.id === m.id ? m : x)) : [...p.materials, m] });
  },
  removeMaterial(projectId: string, materialId: string): void {
    const p = repos.projects.getById(projectId);
    if (p) repos.projects.update(projectId, { materials: p.materials.filter((m) => m.id !== materialId) });
  },

  /**
   * Gera uma PO de COMPRA (fornecedor) com os materiais selecionados e vincula cada
   * material à sua linha — o status passa automaticamente para "comprado/aguardando".
   */
  createPurchaseOrder(
    projectId: string,
    materialIds: string[],
    opts: { supplierId: string; requester: string; expectedDate: string; paymentTerms: string; prices: Record<string, number> },
  ): PurchaseOrder | undefined {
    const p = repos.projects.getById(projectId);
    if (!p) return undefined;
    const selected = p.materials.filter((m) => materialIds.includes(m.id));
    if (!selected.length) return undefined;
    const lines: POLineItem[] = selected.map((m, i) => ({
      id: newId('pol'),
      lineNumber: i + 1,
      partNumber: m.partNumber,
      description: m.description,
      quantity: m.quantity,
      unitPrice: opts.prices[m.id] ?? 0,
      expectedDeliveryDate: opts.expectedDate,
      status: 'open',
    }));
    const supplier = repos.suppliers.getById(opts.supplierId);
    if (!supplier) return undefined;
    const po: PurchaseOrder = {
      id: newId('po'),
      poNumber: nextPurchaseNumber(repos.purchaseOrders.getAll()),
      kind: 'purchase',
      supplierId: supplier.id,
      customerOrVendor: supplier.name,
      orderDate: todayISO(),
      requester: opts.requester.trim(),
      paymentTerms: opts.paymentTerms.trim(),
      status: 'open',
      notes: `${p.projectNumber} — ${p.customer}`,
      attachments: [],
      lines,
    };
    repos.purchaseOrders.create(po);
    const lineByMat = new Map(selected.map((m, i) => [m.id, lines[i]!.id]));
    repos.projects.update(projectId, {
      materials: p.materials.map((m) => (lineByMat.has(m.id) ? { ...m, status: 'ordered', poId: po.id, poLineId: lineByMat.get(m.id) } : m)),
    });
    return po;
  },

  /**
   * Confirma o recebimento de um material. Se vinculado a uma PO, marca a LINHA da PO
   * como entregue (data real = hoje) e recalcula o status da PO; senão, marca o material.
   */
  receiveMaterial(projectId: string, materialId: string): void {
    const p = repos.projects.getById(projectId);
    const m = p?.materials.find((x) => x.id === materialId);
    if (!p || !m) return;
    const po = m.poId ? repos.purchaseOrders.getById(m.poId) : undefined;
    if (po && m.poLineId) {
      const lines = po.lines.map((l) => (l.id === m.poLineId ? { ...l, status: 'delivered' as const, actualDeliveryDate: todayISO() } : l));
      const status = derivePOStatus(po.status, lines);
      repos.purchaseOrders.update(po.id, { lines, status });
    } else {
      scheduleService.upsertMaterial(projectId, { ...m, status: 'received' });
    }
  },
};

// ───────────── Ausências ─────────────

export type AbsenceDraft = Omit<Absence, 'id'>;

export function validateAbsence(d: AbsenceDraft): Errors<AbsenceDraft> {
  const e: Errors<AbsenceDraft> = {};
  if (!d.employeeId) e.employeeId = 'calendar.validation.employeeRequired';
  if (!d.startDate) e.startDate = 'calendar.validation.dateRequired';
  if (!d.endDate) e.endDate = 'calendar.validation.dateRequired';
  else if (d.startDate && d.endDate < d.startDate) e.endDate = 'calendar.validation.dateOrder';
  return e;
}

export const absenceService = {
  save(d: AbsenceDraft, id?: string): Absence {
    return id ? repos.absences.update(id, d) : repos.absences.create({ id: newId('abs'), ...d });
  },
  remove(id: string): void {
    repos.absences.remove(id);
  },
};
