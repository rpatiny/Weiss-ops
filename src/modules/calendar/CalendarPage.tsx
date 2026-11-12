import { useCallback, useEffect, useMemo, useState } from 'react';
import {
  DndContext,
  DragOverlay,
  pointerWithin,
  rectIntersection,
  type CollisionDetection,
  PointerSensor,
  TouchSensor,
  useSensor,
  useSensors,
  type DragEndEvent,
  type DragStartEvent,
} from '@dnd-kit/core';
import {
  AlertTriangle,
  CalendarCheck2,
  CalendarRange,
  Check,
  ChevronDown,
  ChevronLeft,
  ChevronRight,
  ListChecks,
  MapPinned,
  Plus,
  Users,
  X,
} from 'lucide-react';
import { clearParams, useRoute } from '@/app/router';
import { Button } from '@/components/ui/Button';
import { Avatar, PageHeader, StatCard } from '@/components/ui/misc';
import { Popover } from '@/components/ui/Popover';
import { useToast } from '@/components/ui/Toast';
import { repos } from '@/data/db';
import { useCollection } from '@/data/hooks';
import {
  activityService,
  findConflicts,
  getVisibleRange,
  groupByDate,
  isLocked,
  nextRouteOrder,
  shiftAnchor,
  dayStops,
  type ActivityDraft,
  type CalendarView,
} from '@/domain/calendar';
import { enumLabel, enumValues } from '@/domain/labels';
import { useI18n } from '@/i18n';
import { cn } from '@/lib/cn';
import { todayISO } from '@/lib/dates';
import { formatDate, formatDateRange, formatMonthYear } from '@/lib/format';
import { usePersistentState } from '@/lib/usePersistentState';
import type { ActivityStatus, CalendarActivity } from '@/types/models';
import { ActivityCard } from './ActivityCard';
import { ActivityDrawer } from './ActivityDrawer';
import { CalendarContext, type CalendarCtx } from './CalendarContext';
import { CalendarGridView } from './CalendarGridView';
import { RouteDrawer } from './RouteDrawer';
import { ScheduleView } from './ScheduleView';

/** Solta onde o PONTEIRO está (preciso em células pequenas); fallback por interseção. */
const collision: CollisionDetection = (args) => {
  const hits = pointerWithin(args);
  return hits.length ? hits : rectIntersection(args);
};

const VIEWS: CalendarView[] = ['week', 'biweekly', 'month', 'schedule'];
const isView = (v: unknown): v is CalendarView => typeof v === 'string' && (VIEWS as string[]).includes(v);
const isStringArray = (v: unknown): v is string[] => Array.isArray(v) && v.every((x) => typeof x === 'string');

export function CalendarPage() {
  const { t } = useI18n();
  const toast = useToast();
  const { params } = useRoute();
  const employees = useCollection('employees');
  const activities = useCollection('activities');
  const purchaseOrders = useCollection('purchaseOrders');
  const spindles = useCollection('spindles');
  const today = todayISO();

  // ───── Preferências persistidas ─────
  const [view, setView] = usePersistentState<CalendarView>('calendar.view', 'week', isView);
  const [scheduleDays, setScheduleDays] = usePersistentState<number>('calendar.scheduleDays', 7, (v): v is number => v === 7 || v === 14);
  const [empFilter, setEmpFilter] = usePersistentState<string[]>('calendar.employees', [], isStringArray);
  const [statusFilter, setStatusFilter] = usePersistentState<string[]>('calendar.statuses', [], isStringArray);
  const [anchor, setAnchor] = useState(today);
  const [onlyConflicts, setOnlyConflicts] = useState(false);

  // ───── Drawers ─────
  const [editing, setEditing] = useState<{ activity?: CalendarActivity; defaults?: Partial<ActivityDraft> } | null>(null);
  const [route, setRoute] = useState<{ date: string; employeeId?: string } | null>(null);
  const [dragId, setDragId] = useState<string | null>(null);

  // Deep-link: #/calendar?open=<activityId>
  const openParam = params.get('open');
  useEffect(() => {
    if (!openParam) return;
    const a = repos.activities.getById(openParam);
    if (a) {
      setAnchor(a.date);
      setEditing({ activity: a });
    }
    clearParams('open');
  }, [openParam]);

  // ───── Lookups ─────
  const employeesById = useMemo(() => new Map(employees.map((e) => [e.id, e])), [employees]);
  const activitiesById = useMemo(() => new Map(activities.map((a) => [a.id, a])), [activities]);
  const poById = useMemo(() => new Map(purchaseOrders.map((p) => [p.id, p])), [purchaseOrders]);
  const spindleById = useMemo(() => new Map(spindles.map((s) => [s.id, s])), [spindles]);
  const conflicts = useMemo(() => findConflicts(activities), [activities]);

  const range = useMemo(() => getVisibleRange(view, anchor, scheduleDays), [view, anchor, scheduleDays]);
  const gridStart = range.days[0]!;
  const gridEnd = range.days[range.days.length - 1]!;

  // ───── Filtros ─────
  const filtered = useMemo(
    () =>
      activities.filter(
        (a) =>
          a.date >= gridStart &&
          a.date <= gridEnd &&
          (empFilter.length === 0 || empFilter.includes(a.employeeId)) &&
          (statusFilter.length === 0 || statusFilter.includes(a.status)) &&
          (!onlyConflicts || conflicts.has(a.id)),
      ),
    [activities, gridStart, gridEnd, empFilter, statusFilter, onlyConflicts, conflicts],
  );
  const byDate = useMemo(() => groupByDate(filtered), [filtered]);

  // Estatísticas do período "real" (sem dias de preenchimento do mês)
  const inPeriod = filtered.filter((a) => a.date >= range.start && a.date <= range.end);
  const periodConflicts = activities.filter(
    (a) => a.date >= range.start && a.date <= range.end && conflicts.has(a.id) && (empFilter.length === 0 || empFilter.includes(a.employeeId)),
  ).length;

  // Linhas da escala: ativos (filtrados) + inativos com atividade no período.
  const scheduleEmployees = useMemo(() => {
    const inRange = new Set(filtered.map((a) => a.employeeId));
    return employees
      .filter((e) => (empFilter.length === 0 || empFilter.includes(e.id)) && (e.status === 'active' || inRange.has(e.id)))
      .sort((a, b) => (a.status === b.status ? a.name.localeCompare(b.name) : a.status === 'active' ? -1 : 1));
  }, [employees, filtered, empFilter]);
  const byCell = useMemo(() => {
    const m = new Map<string, CalendarActivity[]>();
    for (const a of filtered) {
      const k = `${a.employeeId}|${a.date}`;
      m.set(k, [...(m.get(k) ?? []), a]);
    }
    return m;
  }, [filtered]);

  // ───── Ações ─────
  const openCreate = useCallback(
    (date: string, employeeId?: string) => {
      const emp =
        employeeId ??
        (empFilter.length === 1 && employeesById.get(empFilter[0]!)?.status === 'active' ? empFilter[0] : undefined) ??
        '';
      const last = emp ? dayStops(repos.activities.getAll(), emp, date).at(-1) : undefined;
      const start = last?.endTime && last.endTime < '17:00' ? last.endTime : '08:00';
      const [h, m] = start.split(':').map(Number);
      const end = `${String(Math.min(23, (h ?? 8) + 2)).padStart(2, '0')}:${String(m ?? 0).padStart(2, '0')}`;
      setEditing({
        defaults: { date, employeeId: emp, startTime: start, endTime: end, routeOrder: emp ? nextRouteOrder(emp, date) : 1 },
      });
    },
    [empFilter, employeesById],
  );

  const ctx: CalendarCtx = {
    employeesById,
    activitiesById,
    poById,
    spindleById,
    conflicts,
    today,
    onOpenActivity: (a) => setEditing({ activity: a }),
    onCreate: openCreate,
    onOpenRoute: (date, employeeId) => setRoute({ date, employeeId }),
    onFocusDate: (date) => {
      setAnchor(date);
      if (view === 'month') setView('week');
    },
  };

  // ───── Drag & drop ─────
  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 6 } }),
    useSensor(TouchSensor, { activationConstraint: { delay: 220, tolerance: 6 } }),
  );

  const onDragStart = (e: DragStartEvent) => setDragId(String(e.active.id));

  const onDragEnd = (e: DragEndEvent) => {
    setDragId(null);
    const a = activitiesById.get(String(e.active.id));
    const overId = e.over?.id ? String(e.over.id) : null;
    if (!a || !overId) return;
    if (isLocked(a)) {
      toast.info(t('calendar.toast.locked'));
      return;
    }
    const [kind, p1, p2] = overId.split('|');
    const date = kind === 'day' ? p1 : p2;
    const employeeId = kind === 'cell' ? p1 : undefined;
    if (!date) return;
    if (employeeId && employeesById.get(employeeId)?.status !== 'active') {
      toast.error(t('calendar.toast.inactiveTarget'));
      return;
    }
    const moved = activityService.move(a.id, date, employeeId);
    if (!moved) return;
    const emp = employeesById.get(moved.employeeId);
    toast.success(
      employeeId && employeeId !== a.employeeId
        ? t('calendar.toast.movedTo', { employee: emp?.name ?? '', date: formatDate(date) })
        : t('calendar.toast.moved', { date: formatDate(date) }),
    );
    // Alerta de conflito em tempo real após o drop
    if (findConflicts(repos.activities.getAll()).has(moved.id)) {
      toast.error(t('calendar.toast.conflictCreated', { employee: emp?.name ?? '', date: formatDate(date) }));
    }
  };

  const dragged = dragId ? activitiesById.get(dragId) : undefined;

  const periodLabel = view === 'month' ? formatMonthYear(anchor) : formatDateRange(range.start, range.end);
  const activeEmployees = employees.filter((e) => e.status === 'active').sort((a, b) => a.name.localeCompare(b.name));
  const inactiveEmployees = employees.filter((e) => e.status === 'inactive').sort((a, b) => a.name.localeCompare(b.name));
  const hasFilters = empFilter.length > 0 || statusFilter.length > 0 || onlyConflicts;

  const toggleIn = (list: string[], v: string) => (list.includes(v) ? list.filter((x) => x !== v) : [...list, v]);

  return (
    <CalendarContext.Provider value={ctx}>
      <PageHeader
        icon={CalendarRange}
        title={t('calendar.title')}
        description={t('calendar.description')}
        actions={
          <>
            <Button icon={MapPinned} onClick={() => setRoute({ date: today })}>
              {t('calendar.routesToday')}
            </Button>
            <Button variant="primary" icon={Plus} onClick={() => openCreate(view === 'month' || anchor < range.start || anchor > range.end ? today : anchor)}>
              {t('calendar.newActivity')}
            </Button>
          </>
        }
      />

      {/* Indicadores */}
      <div className="mb-4 grid grid-cols-1 gap-3 sm:grid-cols-3">
        <StatCard label={t('calendar.stats.activities')} value={inPeriod.length} icon={ListChecks} tone="info" />
        <StatCard label={t('calendar.stats.completed')} value={inPeriod.filter((a) => a.status === 'completed').length} icon={CalendarCheck2} tone="success" />
        <StatCard
          label={t('calendar.stats.conflicts')}
          value={periodConflicts}
          icon={AlertTriangle}
          tone={periodConflicts ? 'danger' : 'default'}
          onClick={() => setOnlyConflicts((v) => !v)}
          hint={onlyConflicts ? t('calendar.stats.filterActive') : undefined}
        />
      </div>

      {periodConflicts > 0 && !onlyConflicts && (
        <button
          type="button"
          onClick={() => setOnlyConflicts(true)}
          className="mb-4 flex w-full items-center gap-3 rounded-lg border border-red-300 bg-red-50 px-4 py-2.5 text-left text-sm text-red-800 hover:bg-red-100 dark:border-red-900 dark:bg-red-950/40 dark:text-red-300"
        >
          <AlertTriangle className="size-4 shrink-0" />
          {t('calendar.conflictBanner', { count: periodConflicts })}
        </button>
      )}

      {/* Toolbar */}
      <div className="card mb-4 flex flex-col gap-3 p-3 xl:flex-row xl:items-center">
        <div className="flex flex-wrap items-center gap-2">
          <div className="inline-flex max-w-full overflow-x-auto rounded-lg bg-slate-100 p-1 dark:bg-slate-800" role="tablist">
            {VIEWS.map((v) => (
              <button
                key={v}
                role="tab"
                aria-selected={view === v}
                onClick={() => setView(v)}
                className={cn(
                  'rounded-md px-3 py-1.5 text-sm font-medium whitespace-nowrap transition-colors',
                  view === v ? 'bg-white text-slate-900 shadow-sm dark:bg-slate-700 dark:text-white' : 'text-slate-600 hover:text-slate-900 dark:text-slate-400 dark:hover:text-white',
                )}
              >
                {t(`calendar.views.${v}`)}
              </button>
            ))}
          </div>
          {view === 'schedule' && (
            <div className="inline-flex rounded-lg border border-slate-200 p-0.5 dark:border-slate-700">
              {[7, 14].map((n) => (
                <button
                  key={n}
                  onClick={() => setScheduleDays(n)}
                  className={cn('rounded-md px-2.5 py-1 text-xs font-medium', scheduleDays === n ? 'bg-slate-900 text-white dark:bg-slate-600' : 'text-slate-600 dark:text-slate-400')}
                >
                  {t('calendar.days', { count: n })}
                </button>
              ))}
            </div>
          )}
        </div>

        <div className="flex items-center gap-2">
          <Button size="sm" icon={ChevronLeft} onClick={() => setAnchor(shiftAnchor(view, anchor, -1, scheduleDays))} aria-label={t('common.previous')} />
          <Button size="sm" onClick={() => setAnchor(today)}>
            {t('common.today')}
          </Button>
          <Button size="sm" icon={ChevronRight} onClick={() => setAnchor(shiftAnchor(view, anchor, 1, scheduleDays))} aria-label={t('common.next')} />
          <h2 className="ml-1 text-base font-semibold whitespace-nowrap text-slate-900 dark:text-white">{periodLabel}</h2>
        </div>

        <div className="flex flex-wrap items-center gap-2 xl:ml-auto">
          {/* Filtro de colaboradores */}
          <Popover
            align="right"
            trigger={({ toggle, open }) => (
              <Button size="sm" icon={Users} onClick={toggle} aria-expanded={open} className={cn(empFilter.length > 0 && 'border-brand-500 text-brand-700 dark:text-brand-400')}>
                {empFilter.length ? t('calendar.filters.selectedEmployees', { count: empFilter.length }) : t('calendar.filters.allEmployees')}
                <ChevronDown className="size-3.5" />
              </Button>
            )}
          >
            <div className="max-h-80 overflow-y-auto">
              <button onClick={() => setEmpFilter([])} className="flex w-full items-center gap-2 rounded-md px-2 py-1.5 text-sm hover:bg-slate-100 dark:hover:bg-slate-800">
                <span className="flex size-4 items-center justify-center">{empFilter.length === 0 && <Check className="size-4 text-brand-600" />}</span>
                {t('calendar.filters.allEmployees')}
              </button>
              <div className="my-1 border-t border-slate-200 dark:border-slate-800" />
              {[...activeEmployees, ...inactiveEmployees].map((e) => {
                const on = empFilter.includes(e.id);
                return (
                  <button
                    key={e.id}
                    onClick={() => setEmpFilter(toggleIn(empFilter, e.id))}
                    className="flex w-full items-center gap-2 rounded-md px-2 py-1.5 text-left text-sm hover:bg-slate-100 dark:hover:bg-slate-800"
                    role="menuitemcheckbox"
                    aria-checked={on}
                  >
                    <span className={cn('flex size-4 items-center justify-center rounded border', on ? 'border-brand-500 bg-brand-500 text-slate-950' : 'border-slate-300 dark:border-slate-600')}>
                      {on && <Check className="size-3" strokeWidth={3} />}
                    </span>
                    <Avatar name={e.name} color={e.color} size="sm" muted={e.status === 'inactive'} />
                    <span className={cn('truncate', e.status === 'inactive' && 'text-slate-400')}>{e.name}</span>
                  </button>
                );
              })}
            </div>
          </Popover>

          {/* Filtro de status */}
          <div className="flex flex-wrap gap-1" role="group" aria-label={t('calendar.filters.statuses')}>
            {enumValues('activityStatus').map((s: ActivityStatus) => {
              const on = statusFilter.includes(s);
              return (
                <button
                  key={s}
                  onClick={() => setStatusFilter(toggleIn(statusFilter, s))}
                  aria-pressed={on}
                  className={cn(
                    'rounded-full border px-2.5 py-1 text-xs font-medium transition-colors',
                    on
                      ? 'border-slate-900 bg-slate-900 text-white dark:border-white dark:bg-white dark:text-slate-900'
                      : 'border-slate-300 text-slate-600 hover:bg-slate-100 dark:border-slate-700 dark:text-slate-400 dark:hover:bg-slate-800',
                  )}
                >
                  {enumLabel(t, 'activityStatus', s)}
                </button>
              );
            })}
          </div>

          {hasFilters && (
            <Button
              size="sm"
              variant="ghost"
              icon={X}
              onClick={() => {
                setEmpFilter([]);
                setStatusFilter([]);
                setOnlyConflicts(false);
              }}
            >
              {t('common.clearFilters')}
            </Button>
          )}
        </div>
      </div>

      <p className="mb-2 text-xs text-slate-500">{t('calendar.dragHint')}</p>

      <DndContext sensors={sensors} collisionDetection={collision} onDragStart={onDragStart} onDragEnd={onDragEnd} onDragCancel={() => setDragId(null)}>
        {view === 'schedule' ? (
          <ScheduleView days={range.days} employees={scheduleEmployees} byCell={byCell} />
        ) : (
          <CalendarGridView view={view} days={range.days} byDate={byDate} anchor={anchor} />
        )}
        <DragOverlay dropAnimation={null}>
          {dragged ? (
            <div className="w-52">
              <ActivityCard activity={dragged} variant={view === 'week' ? 'full' : 'compact'} overlay />
            </div>
          ) : null}
        </DragOverlay>
      </DndContext>

      {filtered.length === 0 && <p className="mt-4 text-center text-sm text-slate-500">{t('calendar.emptyPeriod')}</p>}

      <ActivityDrawer open={!!editing} activity={editing?.activity} defaults={editing?.defaults} onClose={() => setEditing(null)} />
      <RouteDrawer
        open={!!route}
        date={route?.date ?? today}
        employeeId={route?.employeeId}
        onClose={() => setRoute(null)}
        onOpenActivity={(a) => {
          setRoute(null);
          setEditing({ activity: a });
        }}
      />
    </CalendarContext.Provider>
  );
}
