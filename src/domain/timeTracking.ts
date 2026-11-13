/**
 * Horas da oficina (ponto por QR code): check-in/check-out por fase de cada projeto.
 *
 * Regras:
 * - **Um serviço por vez:** quem inicia um projeto fica com ele até concluir todas as fases ativas, na ordem.
 *   Só então pode escolher outro (ou se a supervisão o liberar — `released`).
 * - **Ordem obrigatória:** a fase não é escolhida; é sempre a próxima pendente do projeto (progresso compartilhado
 *   entre os técnicos do mesmo projeto). "Pausar" para o relógio sem concluir; "Concluir fase" libera a próxima.
 * - O técnico se identifica pelo PIN do ponto (`Employee.clockPinHash`), sem login no app.
 * - Apontamento aberto de um dia anterior (ou com mais de 12 h) vai para revisão da supervisão — nunca é
 *   fechado sozinho com uma hora inventada.
 * - Correções/lançamentos manuais exigem `time.manage` e ficam marcados (`source: 'manual'`, `editedBy`).
 */
import { assertCan } from '@/app/session';
import { isProjectActive } from './purchasing';
import { repos } from '@/data/db';
import { toISODate } from '@/lib/dates';
import { newId } from '@/lib/id';
import { clockPinHash } from '@/lib/sha256';
import type { Employee, Project, TimeEntry, WorkPhase } from '@/types/models';
import type { TranslationKey } from '@/i18n/types';

export const REVIEW_AFTER_HOURS = 12;

/** Data local (YYYY-MM-DD) de um instante ISO. */
export const localDay = (iso: string) => toISODate(new Date(iso));

/** Duração em minutos (até agora, se em andamento). */
export function entryMinutes(e: Pick<TimeEntry, 'start' | 'end'>, now = Date.now()): number {
  const end = e.end ? Date.parse(e.end) : now;
  return Math.max(0, Math.round((end - Date.parse(e.start)) / 60000));
}

/** Aberto há mais de 12 h ou desde um dia anterior: precisa de revisão. */
export function needsReview(e: TimeEntry, now = Date.now()): boolean {
  if (e.end) return false;
  return localDay(e.start) < toISODate(new Date(now)) || entryMinutes(e, now) > REVIEW_AFTER_HOURS * 60;
}

export const openEntryOf = (employeeId: string, entries: readonly TimeEntry[]) =>
  entries.filter((e) => e.employeeId === employeeId && !e.end).sort((a, b) => b.start.localeCompare(a.start))[0];

/** `125` → `2h05` */
export function formatMinutes(min: number): string {
  const h = Math.floor(min / 60);
  const m = min % 60;
  return h ? `${h}h${String(m).padStart(2, '0')}` : `${m} min`;
}

export const formatHoursDecimal = (min: number) => Math.round((min / 60) * 10) / 10;

export const activePhases = (phases: readonly WorkPhase[]) => phases.filter((p) => p.active).sort((a, b) => a.order - b.order);

/** Minutos por fase de um projeto (somente apontamentos dele). */
export function minutesByPhase(projectId: string, entries: readonly TimeEntry[], now = Date.now()): Map<string, number> {
  const out = new Map<string, number>();
  for (const e of entries) if (e.projectId === projectId) out.set(e.phaseId, (out.get(e.phaseId) ?? 0) + entryMinutes(e, now));
  return out;
}

export const canClock = (e: Employee) => e.status === 'active' && !!e.clockPinHash;

// ───────────── Progresso do serviço pelas fases ─────────────

export type PhaseState = 'done' | 'active' | 'next' | 'pending';

export interface JobProgress {
  projectId: string;
  phases: { phase: WorkPhase; state: PhaseState; minutes: number; doneAt?: string; workers: string[] }[];
  done: number;
  total: number;
  /** Todas as fases ativas concluídas. */
  complete: boolean;
  /** Próxima fase a fazer (a ativa, se houver alguém nela). */
  next?: WorkPhase;
  started: boolean;
}

export function jobProgress(projectId: string, phases: readonly WorkPhase[], entries: readonly TimeEntry[], now = Date.now()): JobProgress {
  const list = activePhases(phases);
  const mine = entries.filter((e) => e.projectId === projectId);
  const doneAt = new Map<string, string>();
  for (const e of mine) if (e.completesPhase && e.end && (!doneAt.has(e.phaseId) || e.end > doneAt.get(e.phaseId)!)) doneAt.set(e.phaseId, e.end);
  const next = list.find((p) => !doneAt.has(p.id));
  const rows = list.map((phase) => {
    const es = mine.filter((e) => e.phaseId === phase.id);
    const open = es.some((e) => !e.end);
    const state: PhaseState = doneAt.has(phase.id) ? 'done' : open ? 'active' : phase.id === next?.id ? 'next' : 'pending';
    return { phase, state, minutes: es.reduce((s, e) => s + entryMinutes(e, now), 0), doneAt: doneAt.get(phase.id), workers: [...new Set(es.map((e) => e.employeeId))] };
  });
  const done = rows.filter((r) => r.state === 'done').length;
  return { projectId, phases: rows, done, total: rows.length, complete: rows.length > 0 && done === rows.length, next, started: mine.length > 0 };
}

/** Serviço que prende o colaborador: projeto do último apontamento, enquanto houver fase pendente e não liberado. */
export function currentJobOf(employeeId: string, entries: readonly TimeEntry[], phases: readonly WorkPhase[], projectsById: ReadonlyMap<string, Project>): string | undefined {
  const latest = entries.filter((e) => e.employeeId === employeeId).sort((a, b) => b.start.localeCompare(a.start))[0];
  if (!latest || latest.released) return undefined;
  const project = projectsById.get(latest.projectId);
  if (!project || !isProjectActive(project)) return undefined;
  return jobProgress(latest.projectId, phases, entries).complete ? undefined : latest.projectId;
}

// ───────────── Ponto (técnico, sem login no app) ─────────────

export type ClockResult = { ok: true; entry: TimeEntry; jobComplete?: boolean } | { ok: false; error: TranslationKey; vars?: Record<string, string> };

export function verifyClockPin(employeeId: string, pin: string): boolean {
  const emp = repos.employees.getById(employeeId);
  return !!emp?.clockPinHash && canClock(emp) && clockPinHash(employeeId, pin) === emp.clockPinHash;
}

const projectsMap = () => new Map(repos.projects.getAll().map((p) => [p.id, p]));

export const clockService = {
  /**
   * Inicia (ou retoma) a próxima fase pendente do projeto. Recusa outro projeto enquanto o atual não terminar.
   */
  start(employeeId: string, pin: string, projectId: string, now = new Date()): ClockResult {
    if (!verifyClockPin(employeeId, pin)) return { ok: false, error: 'clock.errors.pin' };
    const projects = projectsMap();
    const project = projects.get(projectId);
    if (!project || !isProjectActive(project)) return { ok: false, error: 'clock.errors.project' };
    const entries = repos.timeEntries.getAll();
    const phases = repos.workPhases.getAll();
    const current = currentJobOf(employeeId, entries, phases, projects);
    if (current && current !== projectId) return { ok: false, error: 'clock.errors.locked', vars: { project: projects.get(current)?.projectNumber ?? '' } };
    const open = openEntryOf(employeeId, entries);
    if (open) return { ok: true, entry: open };
    const progress = jobProgress(projectId, phases, entries);
    if (progress.complete || !progress.next) return { ok: false, error: 'clock.errors.projectDone' };
    const entry: TimeEntry = { id: newId('te'), employeeId, projectId, phaseId: progress.next.id, start: now.toISOString(), source: 'qr', note: '' };
    repos.timeEntries.upsert(entry);
    return { ok: true, entry };
  },

  /** Check-out. `complete` = "Concluir fase" (libera a próxima); senão é uma pausa. */
  stop(employeeId: string, pin: string, complete: boolean, now = new Date()): ClockResult {
    if (!verifyClockPin(employeeId, pin)) return { ok: false, error: 'clock.errors.pin' };
    const open = openEntryOf(employeeId, repos.timeEntries.getAll());
    if (!open) return { ok: false, error: 'clock.errors.nothingOpen' };
    const entry: TimeEntry = { ...open, end: now.toISOString(), ...(complete ? { completesPhase: true } : {}) };
    repos.timeEntries.upsert(entry);
    const jobComplete = complete && jobProgress(open.projectId, repos.workPhases.getAll(), repos.timeEntries.getAll()).complete;
    return { ok: true, entry, jobComplete };
  },
};

// ───────────── Supervisão ─────────────

export type EntryDraft = Pick<TimeEntry, 'employeeId' | 'projectId' | 'phaseId' | 'start' | 'note'> & { end?: string; completesPhase?: boolean };

export function validateEntry(d: EntryDraft): TranslationKey | undefined {
  if (!d.employeeId) return 'timesheet.errors.employee';
  if (!d.projectId) return 'timesheet.errors.project';
  if (!d.phaseId) return 'timesheet.errors.phase';
  if (!d.start || Number.isNaN(Date.parse(d.start))) return 'timesheet.errors.start';
  if (d.end && (Number.isNaN(Date.parse(d.end)) || d.end <= d.start)) return 'timesheet.errors.end';
  return undefined;
}

export const timesheetService = {
  save(d: EntryDraft, id?: string): TimeEntry {
    const user = assertCan('time.manage');
    const prev = id ? repos.timeEntries.getById(id) : undefined;
    const entry: TimeEntry = { ...(prev ?? { autoClosed: undefined }), ...d, id: id ?? newId('te'), source: 'manual', editedBy: user.id };
    if (!entry.end) delete entry.end;
    if (!entry.end || !entry.completesPhase) delete entry.completesPhase;
    repos.timeEntries.upsert(entry);
    return entry;
  },
  /** Libera o colaborador do serviço atual sem concluir as fases (encerra a fase aberta como pausa). */
  release(employeeId: string, note: string, now = new Date()): void {
    const user = assertCan('time.manage');
    const all = repos.timeEntries.getAll().filter((e) => e.employeeId === employeeId);
    const latest = [...all].sort((a, b) => b.start.localeCompare(a.start))[0];
    if (!latest) return;
    repos.timeEntries.upsert({ ...latest, end: latest.end ?? now.toISOString(), released: { by: user.id, at: now.toISOString(), note } });
  },
  remove(id: string): void {
    assertCan('time.manage');
    repos.timeEntries.remove(id);
  },
  setClockPin(employeeId: string, pin: string | null): void {
    assertCan('time.manage');
    const emp = repos.employees.getById(employeeId);
    if (!emp) return;
    const next = { ...emp };
    if (pin) next.clockPinHash = clockPinHash(employeeId, pin);
    else delete next.clockPinHash;
    repos.employees.upsert(next);
  },
  savePhases(phases: WorkPhase[]): void {
    assertCan('time.manage');
    repos.workPhases.replaceAll(phases.map((p, i) => ({ ...p, order: i + 1 })));
  },
};
