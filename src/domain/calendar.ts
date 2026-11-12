/**
 * Regras de domínio da Agenda & Rotas: validação, conflitos de horário,
 * ordem de paradas, rotas do Google Maps e movimentação (drag-and-drop).
 */
import { repos } from '@/data/db';
import type { TranslationKey } from '@/i18n/types';
import { addDays, addMonths, dateRange, diffDays, endOfMonth, startOfMonth, startOfWeek, timeToMinutes } from '@/lib/dates';
import { newId } from '@/lib/id';
import type { CalendarActivity, Employee } from '@/types/models';

export type ActivityDraft = Omit<CalendarActivity, 'id'>;
export type ActivityErrors = Partial<Record<keyof ActivityDraft, TranslationKey>>;

export type CalendarView = 'week' | 'biweekly' | 'month' | 'schedule';

/** Atividades "travadas" não podem ser arrastadas (preservam histórico). */
export const isLocked = (a: Pick<CalendarActivity, 'status'>) => a.status === 'completed' || a.status === 'canceled';

// ───────────── Período visível ─────────────

export interface VisibleRange {
  start: string;
  end: string;
  /** Datas exibidas (em semanas completas para as visões de calendário). */
  days: string[];
}

/** Calcula o intervalo exibido para cada visão a partir de uma data âncora. */
export function getVisibleRange(view: CalendarView, anchor: string, scheduleDays = 7): VisibleRange {
  switch (view) {
    case 'week': {
      const start = startOfWeek(anchor);
      return { start, end: addDays(start, 6), days: dateRange(start, 7) };
    }
    case 'biweekly': {
      const start = startOfWeek(anchor);
      return { start, end: addDays(start, 13), days: dateRange(start, 14) };
    }
    case 'schedule': {
      const start = startOfWeek(anchor);
      return { start, end: addDays(start, scheduleDays - 1), days: dateRange(start, scheduleDays) };
    }
    case 'month': {
      const first = startOfMonth(anchor);
      const last = endOfMonth(anchor);
      const gridStart = startOfWeek(first);
      const gridEnd = addDays(startOfWeek(last), 6);
      const count = diffDays(gridStart, gridEnd) + 1;
      return { start: first, end: last, days: dateRange(gridStart, count) };
    }
  }
}

/** Avança/retrocede o período conforme a visão. */
export function shiftAnchor(view: CalendarView, anchor: string, dir: 1 | -1, scheduleDays = 7): string {
  switch (view) {
    case 'week':
      return addDays(anchor, 7 * dir);
    case 'biweekly':
      return addDays(anchor, 14 * dir);
    case 'schedule':
      return addDays(anchor, scheduleDays * dir);
    case 'month':
      return addMonths(startOfMonth(anchor), dir);
  }
}

// ───────────── Ordenação & agrupamento ─────────────

export const byRoute = (a: CalendarActivity, b: CalendarActivity) =>
  a.routeOrder - b.routeOrder || a.startTime.localeCompare(b.startTime);

export const byTime = (a: CalendarActivity, b: CalendarActivity) =>
  a.startTime.localeCompare(b.startTime) || a.routeOrder - b.routeOrder;

/** Atividades de um colaborador em um dia, na ordem de paradas. */
export function dayStops(activities: readonly CalendarActivity[], employeeId: string, date: string): CalendarActivity[] {
  return activities.filter((a) => a.employeeId === employeeId && a.date === date).sort(byRoute);
}

/** Agrupa por `YYYY-MM-DD`. */
export function groupByDate(activities: readonly CalendarActivity[]): Map<string, CalendarActivity[]> {
  const map = new Map<string, CalendarActivity[]>();
  for (const a of activities) {
    const list = map.get(a.date);
    if (list) list.push(a);
    else map.set(a.date, [a]);
  }
  return map;
}

// ───────────── Conflitos ─────────────

const overlaps = (a: CalendarActivity, b: CalendarActivity) =>
  timeToMinutes(a.startTime) < timeToMinutes(b.endTime) && timeToMinutes(b.startTime) < timeToMinutes(a.endTime);

/**
 * Detecta sobreposição de horários do MESMO colaborador no MESMO dia
 * (atividades canceladas são ignoradas). Retorna activityId → ids conflitantes.
 */
export function findConflicts(activities: readonly CalendarActivity[]): Map<string, string[]> {
  const result = new Map<string, string[]>();
  const groups = new Map<string, CalendarActivity[]>();
  for (const a of activities) {
    if (a.status === 'canceled') continue;
    const k = `${a.employeeId}|${a.date}`;
    const g = groups.get(k);
    if (g) g.push(a);
    else groups.set(k, [a]);
  }
  for (const group of groups.values()) {
    if (group.length < 2) continue;
    for (let i = 0; i < group.length; i++) {
      for (let j = i + 1; j < group.length; j++) {
        const a = group[i]!;
        const b = group[j]!;
        if (overlaps(a, b)) {
          result.set(a.id, [...(result.get(a.id) ?? []), b.id]);
          result.set(b.id, [...(result.get(b.id) ?? []), a.id]);
        }
      }
    }
  }
  return result;
}

/** Conflitos que um rascunho (criação/edição) teria com as atividades existentes. */
export function conflictsForDraft(draft: ActivityDraft, activities: readonly CalendarActivity[], selfId?: string): CalendarActivity[] {
  if (draft.status === 'canceled' || !draft.employeeId || !draft.date || !draft.startTime || !draft.endTime) return [];
  const probe = { ...draft, id: selfId ?? '__draft__' };
  return activities.filter(
    (a) => a.id !== selfId && a.status !== 'canceled' && a.employeeId === draft.employeeId && a.date === draft.date && overlaps(probe, a),
  );
}

// ───────────── Google Maps ─────────────

/** Paradas válidas para rota: não canceladas e com endereço. */
export function routableStops(stops: readonly CalendarActivity[]): CalendarActivity[] {
  return stops.filter((s) => s.status !== 'canceled' && s.address.trim()).sort(byRoute);
}

/**
 * Monta `https://www.google.com/maps/dir/Endereco1/Endereco2/...`.
 * Com `baseAddress`, a rota parte e retorna à base.
 */
export function buildGoogleMapsUrl(addresses: string[], baseAddress?: string): string {
  const points = baseAddress ? [baseAddress, ...addresses, baseAddress] : addresses;
  return `https://www.google.com/maps/dir/${points.map((p) => encodeURIComponent(p.trim())).join('/')}`;
}

// ───────────── Validação ─────────────

export function emptyActivity(partial: Partial<ActivityDraft> = {}): ActivityDraft {
  return {
    employeeId: '',
    customer: '',
    address: '',
    serviceType: 'site_visit',
    description: '',
    date: '',
    startTime: '08:00',
    endTime: '10:00',
    routeOrder: 1,
    status: 'planned',
    ...partial,
  };
}

export function validateActivity(d: ActivityDraft, employees: readonly Employee[], original?: CalendarActivity): ActivityErrors {
  const e: ActivityErrors = {};
  const emp = employees.find((x) => x.id === d.employeeId);
  if (!d.employeeId || !emp) e.employeeId = 'calendar.validation.employeeRequired';
  // Inativos só são aceitos se a atividade JÁ era deles (histórico preservado).
  else if (emp.status === 'inactive' && original?.employeeId !== d.employeeId) e.employeeId = 'calendar.validation.employeeInactive';
  if (!d.customer.trim()) e.customer = 'calendar.validation.customerRequired';
  if (!d.date) e.date = 'calendar.validation.dateRequired';
  if (!d.startTime) e.startTime = 'calendar.validation.timeRequired';
  if (!d.endTime) e.endTime = 'calendar.validation.timeRequired';
  else if (d.startTime && timeToMinutes(d.endTime) <= timeToMinutes(d.startTime)) e.endTime = 'calendar.validation.timeOrder';
  return e;
}

const normalize = (d: ActivityDraft): ActivityDraft => ({
  ...d,
  customer: d.customer.trim(),
  address: d.address.trim(),
  description: d.description.trim(),
  routeOrder: Math.max(1, Math.round(d.routeOrder || 1)),
  poId: d.poId || undefined,
  spindleId: d.spindleId || undefined,
});

/** Próxima ordem de parada livre para o colaborador/dia. */
export function nextRouteOrder(employeeId: string, date: string, excludeId?: string): number {
  const stops = repos.activities.getAll().filter((a) => a.employeeId === employeeId && a.date === date && a.id !== excludeId);
  return stops.reduce((max, a) => Math.max(max, a.routeOrder), 0) + 1;
}

/** Renumera as paradas 1..n mantendo a ordem atual (ou a ordem informada). */
function renumber(employeeId: string, date: string, orderedIds?: string[]): void {
  const all = repos.activities.getAll();
  const stops = all.filter((a) => a.employeeId === employeeId && a.date === date).sort(byRoute);
  const ordered = orderedIds ? orderedIds.map((id) => stops.find((s) => s.id === id)).filter((x): x is CalendarActivity => !!x) : stops;
  const order = new Map(ordered.map((a, i) => [a.id, i + 1]));
  if (stops.every((s) => s.routeOrder === order.get(s.id))) return;
  repos.activities.replaceAll(all.map((a) => (order.has(a.id) ? { ...a, routeOrder: order.get(a.id)! } : a)));
}

// ───────────── Comandos ─────────────

export const activityService = {
  create(draft: ActivityDraft): CalendarActivity {
    const created = repos.activities.create({ id: newId('act'), ...normalize(draft) });
    return created;
  },

  update(id: string, draft: ActivityDraft): CalendarActivity {
    const before = repos.activities.getById(id);
    const updated = repos.activities.update(id, normalize(draft));
    // Se mudou de dia/colaborador, compacta a rota de origem.
    if (before && (before.date !== updated.date || before.employeeId !== updated.employeeId)) renumber(before.employeeId, before.date);
    return updated;
  },

  remove(id: string): void {
    const before = repos.activities.getById(id);
    repos.activities.remove(id);
    if (before) renumber(before.employeeId, before.date);
  },

  /**
   * Reagenda via drag-and-drop. A atividade vai para o FINAL da rota do destino
   * e as duas rotas (origem e destino) são renumeradas.
   */
  move(id: string, date: string, employeeId?: string): CalendarActivity | undefined {
    const a = repos.activities.getById(id);
    if (!a) return undefined;
    const targetEmp = employeeId ?? a.employeeId;
    if (a.date === date && a.employeeId === targetEmp) return undefined;
    const moved = repos.activities.update(id, {
      date,
      employeeId: targetEmp,
      routeOrder: nextRouteOrder(targetEmp, date, id),
    });
    renumber(a.employeeId, a.date);
    return moved;
  },

  /** Define a ordem das paradas de um dia (lista de ids na nova ordem). */
  reorder(employeeId: string, date: string, orderedIds: string[]): void {
    renumber(employeeId, date, orderedIds);
  },

  /** Ordena as paradas do dia pelo horário de início. */
  sortByTime(employeeId: string, date: string): void {
    const ids = dayStops(repos.activities.getAll(), employeeId, date).sort(byTime).map((a) => a.id);
    renumber(employeeId, date, ids);
  },
};
