import { repos } from '@/data/db';
import { todayISO } from '@/lib/dates';
import { newId } from '@/lib/id';
import type { CalendarActivity, Employee } from '@/types/models';

export type EmployeeDraft = Omit<Employee, 'id'>;
export type ValidationErrors<T> = Partial<Record<keyof T, string>>;

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
  if (d.name.trim().length < 2) e.name = 'Informe o nome completo.';
  if (!d.role.trim()) e.role = 'Informe o cargo/função.';
  if (d.email.trim() && !EMAIL_RE.test(d.email.trim())) e.email = 'E-mail inválido.';
  else if (
    d.email.trim() &&
    others.some((o) => o.id !== selfId && o.email.toLowerCase() === d.email.trim().toLowerCase())
  )
    e.email = 'Já existe um colaborador com este e-mail.';
  if (d.phone.trim() && d.phone.replace(/\D/g, '').length < 10) e.phone = 'Telefone deve ter DDD + número.';
  if (!HEX_RE.test(d.color)) e.color = 'Cor deve estar no formato #RRGGBB.';
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

export function activitiesOf(employeeId: string, activities: readonly CalendarActivity[]) {
  return activities.filter((a) => a.employeeId === employeeId);
}

/** Atividades futuras ainda não concluídas/canceladas. */
export function upcomingOpenActivities(employeeId: string, activities: readonly CalendarActivity[], today = todayISO()) {
  return activitiesOf(employeeId, activities)
    .filter((a) => a.date >= today && (a.status === 'planned' || a.status === 'in_progress'))
    .sort((a, b) => (a.date + a.startTime).localeCompare(b.date + b.startTime));
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
    const activityCount = repos.activities.getAll().filter((a) => a.employeeId === id).length;
    return { ok: activityCount === 0, activityCount };
  },
  remove(id: string): void {
    if (!employeeService.canDelete(id).ok) throw new Error('Colaborador possui histórico de atividades. Inative-o em vez de excluir.');
    repos.employees.remove(id);
  },
};
