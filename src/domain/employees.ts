import { repos } from '@/data/db';
import { todayISO } from '@/lib/dates';
import { newId } from '@/lib/id';
import type { Absence, Employee, ProjectAssignment } from '@/types/models';
import type { TranslationKey } from '@/i18n/types';

export type EmployeeDraft = Omit<Employee, 'id'>;
/** Erros de validação como CHAVES de tradução (a UI traduz). */
export type ValidationErrors<T> = Partial<Record<keyof T, TranslationKey>>;

export const emptyEmployee = (color = '#2563eb'): EmployeeDraft => ({
  name: '',
  role: '',
  phone: '',
  email: '',
  color,
  status: 'active',
});

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const HEX_RE = /^#[0-9a-fA-F]{6}$/;

export function validateEmployee(d: EmployeeDraft, others: readonly Employee[], selfId?: string): ValidationErrors<EmployeeDraft> {
  const e: ValidationErrors<EmployeeDraft> = {};
  if (d.name.trim().length < 2) e.name = 'employees.validation.nameRequired';
  if (!d.role.trim()) e.role = 'employees.validation.roleRequired';
  if (d.email.trim() && !EMAIL_RE.test(d.email.trim())) e.email = 'employees.validation.emailInvalid';
  else if (
    d.email.trim() &&
    others.some((o) => o.id !== selfId && o.email.toLowerCase() === d.email.trim().toLowerCase())
  )
    e.email = 'employees.validation.emailDuplicate';
  if (d.phone.trim() && d.phone.replace(/\D/g, '').length < 8) e.phone = 'employees.validation.phoneInvalid';
  if (!HEX_RE.test(d.color)) e.color = 'employees.validation.colorInvalid';
  return e;
}

/** Máscara simples de telefone BR: (11) 98765-4321 / (11) 3456-7890. */
export function maskPhone(v: string): string {
  const d = v.replace(/\D/g, '').slice(0, 11);
  if (d.length <= 2) return d.length ? `(${d}` : '';
  if (d.length <= 6) return `(${d.slice(0, 2)}) ${d.slice(2)}`;
  if (d.length <= 10) return `(${d.slice(0, 2)}) ${d.slice(2, 6)}-${d.slice(6)}`;
  return `(${d.slice(0, 2)}) ${d.slice(2, 7)}-${d.slice(7)}`;
}

const normalize = (d: EmployeeDraft): EmployeeDraft => ({
  ...d,
  name: d.name.trim(),
  role: d.role.trim(),
  phone: d.phone.trim(),
  email: d.email.trim().toLowerCase(),
  color: d.color.toLowerCase(),
});

// ───────── Selectors ─────────

/** Apenas colaboradores ativos podem receber NOVOS agendamentos. */
export const selectActiveEmployees = (all: readonly Employee[]) =>
  all.filter((e) => e.status === 'active').sort((a, b) => a.name.localeCompare(b.name));

/** Alocações em andamento ou futuras (fim >= hoje), ordenadas por início. */
export function upcomingAssignments(employeeId: string, assignments: readonly ProjectAssignment[], today = todayISO()) {
  return assignments
    .filter((a) => a.employeeId === employeeId && a.endDate >= today)
    .sort((a, b) => a.startDate.localeCompare(b.startDate));
}

/** Ausências em andamento ou futuras. */
export function upcomingAbsences(employeeId: string, absences: readonly Absence[], today = todayISO()) {
  return absences.filter((a) => a.employeeId === employeeId && a.endDate >= today).sort((a, b) => a.startDate.localeCompare(b.startDate));
}

// ───────── Commands ─────────

export const employeeService = {
  create(draft: EmployeeDraft): Employee {
    return repos.employees.create({ id: newId('emp'), ...normalize(draft) });
  },
  update(id: string, draft: EmployeeDraft): Employee {
    return repos.employees.update(id, normalize(draft));
  },
  setStatus(id: string, status: Employee['status']): Employee {
    return repos.employees.update(id, { status });
  },
  /**
   * Exclusão física só é permitida sem histórico de atividades — caso contrário
   * o colaborador deve ser inativado (preserva o histórico da agenda).
   */
  canDelete(id: string): { ok: boolean; activityCount: number } {
    const activityCount = repos.assignments.getAll().filter((a) => a.employeeId === id).length;
    return { ok: activityCount === 0, activityCount };
  },
  remove(id: string): void {
    if (!employeeService.canDelete(id).ok) throw new Error('employees.validation.hasHistory');
    repos.absences.replaceAll(repos.absences.getAll().filter((a) => a.employeeId !== id));
    repos.employees.remove(id);
  },
};
