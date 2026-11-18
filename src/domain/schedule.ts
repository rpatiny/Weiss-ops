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
import { assertCan } from '@/app/session';
import type {
  Absence,
  Employee,
  MaterialStatus,
  POLineItem,
  Project,
  ProjectAssignment,
  ProjectMaterial,
  PurchaseOrder,
  SpindleUnit,
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
  // Também é conflito: duas pessoas no MESMO projeto no mesmo período (gera horas em dobro). Só aparece em dados antigos —
  // novas alocações assim são bloqueadas (`checkPlacement`).
  const byPrj = new Map<string, ProjectAssignment[]>();
  for (const a of active) byPrj.set(a.projectId, [...(byPrj.get(a.projectId) ?? []), a]);
  for (const list of byPrj.values())
    for (let i = 0; i < list.length; i++)
      for (let j = i + 1; j < list.length; j++) {
        const a = list[i]!;
        const b = list[j]!;
        if (a.employeeId !== b.employeeId && rangesOverlap(a.startDate, a.endDate, b.startDate, b.endDate)) {
          if (!result.get(a.id)?.includes(b.id)) result.set(a.id, [...(result.get(a.id) ?? []), b.id]);
          if (!result.get(b.id)?.includes(a.id)) result.set(b.id, [...(result.get(b.id) ?? []), a.id]);
        }
      }
  return result;
}

/** Ausências (férias etc.) do colaborador que cruzam o período. */
export function absencesOverlapping(absences: readonly Absence[], employeeId: string, start: string, end: string): Absence[] {
  return absences.filter((x) => x.employeeId === employeeId && rangesOverlap(x.startDate, x.endDate, start, end));
}

export type PlacementError = 'absence' | 'inactive' | 'order' | 'projectTaken' | 'employeeBusy';

/** Contexto para as regras de exclusividade: quem já está na agenda. */
export interface PlacementContext {
  projectId: string;
  assignments: readonly ProjectAssignment[];
  /** Alocação sendo editada/arrastada (não conta contra ela mesma). */
  selfId?: string;
}

/**
 * Exclusividade da agenda: um projeto tem UMA pessoa por vez e uma pessoa está em UM projeto por vez.
 * Devolve a alocação que impede (para mostrar quem/qual projeto).
 */
export function placementClash(employeeId: string, start: string, end: string, ctx: PlacementContext): { kind: 'projectTaken' | 'employeeBusy'; other: ProjectAssignment } | null {
  const hits = ctx.assignments.filter((a) => a.id !== ctx.selfId && rangesOverlap(a.startDate, a.endDate, start, end));
  const taken = hits.find((a) => a.projectId === ctx.projectId && a.employeeId !== employeeId);
  if (taken) return { kind: 'projectTaken', other: taken };
  const busy = hits.find((a) => a.employeeId === employeeId && a.projectId !== ctx.projectId);
  return busy ? { kind: 'employeeBusy', other: busy } : null;
}

/** Valida se uma alocação pode ocupar o período (férias bloqueiam; inativos não recebem). */
export function checkPlacement(
  employee: Employee | undefined,
  start: string,
  end: string,
  absences: readonly Absence[],
  originalEmployeeId?: string,
  ctx?: PlacementContext,
): PlacementError | null {
  if (end < start) return 'order';
  if (!employee || (employee.status === 'inactive' && employee.id !== originalEmployeeId)) return 'inactive';
  if (absencesOverlapping(absences, employee.id, start, end).length) return 'absence';
  if (ctx) return placementClash(employee.id, start, end, ctx)?.kind ?? null;
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
  if (line.status === 'canceled' || po.status === 'canceled') return { status: m.requisitionId ? 'requested' : 'to_buy', po, line };
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
    toBuy: views.filter((v) => v.status === 'to_buy' || v.status === 'requested').length,
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

/**
 * Material já no processo de compras (em requisição ou com PO): passa a ser dado da Logística —
 * o Office não edita nem exclui (Master pode). Volta a ser editável se a requisição for cancelada/recusada sem PO.
 */
/** Projeto no arquivo (concluído e não recuperado): fica fora das telas de trabalho. */
export const isArchived = (p: Pick<Project, 'archived'>) => p.archived === true;

export const isMaterialInPurchasing = (m: Pick<ProjectMaterial, 'requisitionId' | 'poId'>) => !!(m.requisitionId || m.poId);

// ── PO do cliente / Spindle: texto livre com vínculo automático ──
const norm = (v: string | undefined) => (v ?? '').trim().toLowerCase();

/** PO cadastrada cujo número é igual ao texto (sem diferenciar maiúsculas). */
export const findPOByRef = (ref: string | undefined, pos: readonly PurchaseOrder[]) =>
  norm(ref) ? pos.find((p) => norm(p.poNumber) === norm(ref)) : undefined;

/** Spindle cadastrado cujo nº de série é igual ao texto. */
export const findSpindleByRef = (ref: string | undefined, spindles: readonly SpindleUnit[]) =>
  norm(ref) ? spindles.find((s) => norm(s.serialNumber) === norm(ref)) : undefined;

/** Texto exibido da PO do cliente (bases antigas só têm o vínculo `poId`). */
export const projectPoRef = (p: Pick<Project, 'customerPoRef' | 'poId'>, poById: ReadonlyMap<string, PurchaseOrder>) =>
  p.customerPoRef?.trim() || (p.poId ? (poById.get(p.poId)?.poNumber ?? '') : '');

/** Texto exibido do spindle/motor (bases antigas só têm o vínculo `spindleId`). */
export const projectSpindleRef = (p: Pick<Project, 'spindleRef' | 'spindleId'>, spindlesById: ReadonlyMap<string, SpindleUnit>) =>
  p.spindleRef?.trim() || (p.spindleId ? (spindlesById.get(p.spindleId)?.serialNumber ?? '') : '');

/** Limpa os textos e recalcula os vínculos a partir deles (o texto é a fonte da verdade). */
function normalizeProjectDraft(d: ProjectDraft): ProjectDraft {
  const customerPoRef = d.customerPoRef?.trim() || undefined;
  const spindleRef = d.spindleRef?.trim() || undefined;
  return {
    ...d,
    projectNumber: d.projectNumber.trim(),
    customer: d.customer.trim(),
    customerPoRef,
    spindleRef,
    poId: findPOByRef(customerPoRef, repos.purchaseOrders.getAll())?.id,
    clientId: repos.clients.getAll().find((c) => c.name.trim().toLowerCase() === d.customer.trim().toLowerCase())?.id,
    customerPoValue: d.customerPoValue === undefined || Number.isNaN(d.customerPoValue) ? undefined : Math.max(0, d.customerPoValue),
    spindleId: findSpindleByRef(spindleRef, repos.spindles.getAll())?.id,
  };
}

/**
 * Nº do projeto: "1000" + 4 caracteres. Em teste os 4 caracteres são letras (1000AAAA, 1000AAAB, …):
 * o próximo é o maior existente + 1 (base 26).
 */
export const PROJECT_NUMBER_RE = /^1000[A-Z]{4}$/;
export function nextProjectNumber(all: readonly Project[]): string {
  const max = all
    .map((p) => p.projectNumber.trim().toUpperCase())
    .filter((n) => PROJECT_NUMBER_RE.test(n))
    .sort()
    .pop();
  if (!max) return '1000AAAA';
  const chars = max.slice(4).split('');
  for (let i = chars.length - 1; i >= 0; i--) {
    if (chars[i] !== 'Z') {
      chars[i] = String.fromCharCode(chars[i]!.charCodeAt(0) + 1);
      break;
    }
    chars[i] = 'A';
  }
  return `1000${chars.join('')}`;
}

export function nextProjectColor(all: readonly Project[]): string {
  const counts = new Map(PROJECT_COLORS.map((c) => [c, 0]));
  for (const p of all) if (counts.has(p.color)) counts.set(p.color, counts.get(p.color)! + 1);
  return [...counts.entries()].sort((a, b) => a[1] - b[1])[0]![0];
}

// ───────────── Comandos ─────────────

/** Regra também no serviço (não só na tela): projeto com uma pessoa por vez; pessoa com um projeto por vez. */
function assertExclusive(a: ProjectAssignment) {
  const clash = placementClash(a.employeeId, a.startDate, a.endDate, { projectId: a.projectId, assignments: repos.assignments.getAll(), selfId: a.id });
  if (clash) throw new Error(clash.kind === 'projectTaken' ? 'calendar.validation.projectTaken' : 'calendar.validation.employeeBusy');
}

export const scheduleService = {
  createProject(draft: ProjectDraft, firstAssignment?: AssignmentDraft): Project {
    assertCan('schedule.edit');
    const project = repos.projects.create({ id: newId('prj'), ...normalizeProjectDraft(draft), materials: [] });
    if (firstAssignment) scheduleService.addAssignment(project.id, firstAssignment);
    return project;
  },
  updateProject(id: string, draft: ProjectDraft): Project {
    assertCan('schedule.edit');
    const prev = repos.projects.getById(id);
    const next = normalizeProjectDraft(draft);
    // Concluído agora ⇒ vai para o arquivo (some das telas).
    const archive = next.status === 'completed' && prev?.status !== 'completed' ? { archived: true, archivedAt: new Date().toISOString() } : {};
    return repos.projects.update(id, { ...next, ...archive });
  },
  /** Arquivar à mão (ex.: projeto concluído que tinha sido recuperado). */
  archiveProject(id: string): void {
    assertCan('schedule.edit');
    repos.projects.update(id, { archived: true, archivedAt: new Date().toISOString() });
  },
  /** Recuperar do arquivo (a tela exige digitar o nº do projeto). Volta para todas as telas. */
  restoreProject(id: string): void {
    assertCan('schedule.edit');
    repos.projects.update(id, { archived: false, archivedAt: undefined });
  },
  removeProject(id: string): void {
    assertCan('schedule.edit');
    repos.assignments.replaceAll(repos.assignments.getAll().filter((a) => a.projectId !== id));
    repos.projects.remove(id);
  },

  addAssignment(projectId: string, d: AssignmentDraft): ProjectAssignment {
    assertCan('schedule.edit');
    const next = { id: newId('asg'), projectId, employeeId: d.employeeId, startDate: snapForward(d.startDate), endDate: snapBackward(d.endDate) };
    assertExclusive(next);
    return repos.assignments.create(next);
  },
  updateAssignment(id: string, patch: Partial<AssignmentDraft>): ProjectAssignment {
    assertCan('schedule.edit');
    const cur = repos.assignments.getById(id);
    if (cur) assertExclusive({ ...cur, ...patch });
    return repos.assignments.update(id, patch);
  },
  removeAssignment(id: string): void {
    assertCan('schedule.edit');
    repos.assignments.remove(id);
  },

  // Materiais
  upsertMaterial(projectId: string, material: Omit<ProjectMaterial, 'id'> & { id?: string }): void {
    const user = assertCan('materials.edit');
    const p = repos.projects.getById(projectId);
    if (!p) return;
    const prev = material.id ? p.materials.find((x) => x.id === material.id) : undefined;
    if (prev && isMaterialInPurchasing(prev) && user.role !== 'master') throw new Error('auth.lockedByLogistics');
    const m: ProjectMaterial = { ...material, id: material.id ?? newId('mat') };
    const exists = p.materials.some((x) => x.id === m.id);
    repos.projects.update(projectId, { materials: exists ? p.materials.map((x) => (x.id === m.id ? m : x)) : [...p.materials, m] });
  },
  removeMaterial(projectId: string, materialId: string): void {
    const user = assertCan('materials.edit');
    const p = repos.projects.getById(projectId);
    const m = p?.materials.find((x) => x.id === materialId);
    if (m && isMaterialInPurchasing(m) && user.role !== 'master') throw new Error('auth.lockedByLogistics');
    if (p) repos.projects.update(projectId, { materials: p.materials.filter((m) => m.id !== materialId) });
  },

  /**
   * Confirma o recebimento de um material. Se vinculado a uma PO, marca a LINHA da PO
   * como entregue (data real = hoje) e recalcula o status da PO; senão, marca o material.
   */
  receiveMaterial(projectId: string, materialId: string): void {
    // Materiais com PO são recebidos pelo GR (domain/requisitions.ts); aqui só itens sem PO (ex.: estoque).
    assertCan('gr.register');
    const p = repos.projects.getById(projectId);
    const m = p?.materials.find((x) => x.id === materialId);
    if (!p || !m || m.poId) return;
    repos.projects.update(projectId, { materials: p.materials.map((x) => (x.id === materialId ? { ...x, status: 'received' as const } : x)) });
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
    assertCan('schedule.edit');
    return id ? repos.absences.update(id, d) : repos.absences.create({ id: newId('abs'), ...d });
  },
  remove(id: string): void {
    assertCan('schedule.edit');
    repos.absences.remove(id);
  },
};
