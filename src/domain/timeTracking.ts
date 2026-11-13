/**
 * Horas da oficina (ponto por QR code): check-in/check-out por fase de cada projeto.
 *
 * Regras:
 * - Uma pessoa trabalha em uma coisa por vez: iniciar uma fase encerra a que estiver aberta, no mesmo horário.
 * - O técnico se identifica pelo PIN do ponto (`Employee.clockPinHash`), sem login no app.
 * - Apontamento aberto de um dia anterior (ou com mais de 12 h) vai para revisão da supervisão — nunca é
 *   fechado sozinho com uma hora inventada.
 * - Correções/lançamentos manuais exigem `time.manage` e ficam marcados (`source: 'manual'`, `editedBy`).
 */
import { assertCan } from '@/app/session';
import { repos } from '@/data/db';
import { toISODate } from '@/lib/dates';
import { newId } from '@/lib/id';
import { clockPinHash } from '@/lib/sha256';
import type { Employee, TimeEntry, WorkPhase } from '@/types/models';
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

// ───────────── Ponto (técnico, sem login no app) ─────────────

export type ClockResult = { ok: true; entry: TimeEntry; closed?: TimeEntry } | { ok: false; error: TranslationKey };

export function verifyClockPin(employeeId: string, pin: string): boolean {
  const emp = repos.employees.getById(employeeId);
  return !!emp?.clockPinHash && canClock(emp) && clockPinHash(employeeId, pin) === emp.clockPinHash;
}

export const clockService = {
  /** Inicia uma fase; encerra no mesmo instante a que estiver aberta. */
  start(employeeId: string, pin: string, projectId: string, phaseId: string, now = new Date()): ClockResult {
    if (!verifyClockPin(employeeId, pin)) return { ok: false, error: 'clock.errors.pin' };
    if (!repos.projects.getById(projectId)) return { ok: false, error: 'clock.errors.project' };
    if (!repos.workPhases.getById(phaseId)) return { ok: false, error: 'clock.errors.phase' };
    const iso = now.toISOString();
    const open = openEntryOf(employeeId, repos.timeEntries.getAll());
    let closed: TimeEntry | undefined;
    if (open) {
      if (open.projectId === projectId && open.phaseId === phaseId) return { ok: true, entry: open }; // já está nesta fase
      closed = { ...open, end: iso, autoClosed: true };
      repos.timeEntries.upsert(closed);
    }
    const entry: TimeEntry = { id: newId('te'), employeeId, projectId, phaseId, start: iso, source: 'qr', note: '' };
    repos.timeEntries.upsert(entry);
    return { ok: true, entry, closed };
  },

  /** Encerra a fase aberta (check-out). */
  stop(employeeId: string, pin: string, now = new Date()): ClockResult {
    if (!verifyClockPin(employeeId, pin)) return { ok: false, error: 'clock.errors.pin' };
    const open = openEntryOf(employeeId, repos.timeEntries.getAll());
    if (!open) return { ok: false, error: 'clock.errors.nothingOpen' };
    const entry = { ...open, end: now.toISOString() };
    repos.timeEntries.upsert(entry);
    return { ok: true, entry };
  },
};

// ───────────── Supervisão ─────────────

export type EntryDraft = Pick<TimeEntry, 'employeeId' | 'projectId' | 'phaseId' | 'start' | 'note'> & { end?: string };

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
    repos.timeEntries.upsert(entry);
    return entry;
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
