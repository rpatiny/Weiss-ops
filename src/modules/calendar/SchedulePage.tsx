import { useEffect, useMemo, useState } from 'react';
import { AlertTriangle, CalendarRange, Check, ChevronDown, ChevronLeft, ChevronRight, FolderKanban, Package, Palmtree, Plus, Users, X } from 'lucide-react';
import { clearParams, useRoute } from '@/app/router';
import { useCan } from '@/app/session';
import { Button } from '@/components/ui/Button';
import { Avatar, PageHeader, StatCard } from '@/components/ui/misc';
import { Popover } from '@/components/ui/Popover';
import { useToast } from '@/components/ui/Toast';
import { repos } from '@/data/db';
import { useCollection } from '@/data/hooks';
import { enumLabel, enumValues } from '@/domain/labels';
import {
  checkPlacement,
  findConflicts,
  getVisibleDays,
  materialViews,
  scheduleService,
  shiftAnchor,
  summarizeMaterials,
  type MaterialSummary,
  type ScheduleView,
} from '@/domain/schedule';
import { useI18n } from '@/i18n';
import { cn } from '@/lib/cn';
import { businessDaysBetween, rangesOverlap, todayISO } from '@/lib/dates';
import { formatDate, formatDateRange, formatMonthYear } from '@/lib/format';
import { usePersistentState } from '@/lib/usePersistentState';
import type { Absence } from '@/types/models';
import { AbsenceDrawer } from './AbsenceDrawer';
import { GanttChart, type DragResult } from './GanttChart';
import { ProjectDrawer, type ProjectTab } from './ProjectDrawer';

const VIEWS: ScheduleView[] = ['week', 'biweekly', 'month'];
const isView = (v: unknown): v is ScheduleView => typeof v === 'string' && (VIEWS as string[]).includes(v);
const isStringArray = (v: unknown): v is string[] => Array.isArray(v) && v.every((x) => typeof x === 'string');

export function SchedulePage() {
  const { t } = useI18n();
  const toast = useToast();
  const canEdit = useCan()('schedule.edit');
  const { params, path: routePath } = useRoute();
  const employees = useCollection('employees');
  const projects = useCollection('projects');
  const assignments = useCollection('assignments');
  const absences = useCollection('absences');
  const purchaseOrders = useCollection('purchaseOrders');
  const today = todayISO();

  const [view, setView] = usePersistentState<ScheduleView>('schedule.view', 'month', isView);
  const [empFilter, setEmpFilter] = usePersistentState<string[]>('schedule.employees', [], isStringArray);
  const [statusFilter, setStatusFilter] = usePersistentState<string[]>('schedule.statuses', [], isStringArray);
  const [anchor, setAnchor] = useState(today);
  const [onlyConflicts, setOnlyConflicts] = useState(false);
  const [onlyMaterials, setOnlyMaterials] = useState(false);

  const [projectDrawer, setProjectDrawer] = useState<{ id?: string; tab?: ProjectTab; defaults?: { employeeId?: string; date?: string } } | null>(null);
  const [absenceDrawer, setAbsenceDrawer] = useState<{ editing?: Absence } | null>(null);

  // Deep-link: #/calendar?open=<projectId>
  // Só trata o parâmetro quando a rota atual é desta página (evita "roubar" o deep-link de outra tela).
  const openParam = routePath === '/calendar' ? params.get('open') : null;
  useEffect(() => {
    if (!openParam) return;
    if (repos.projects.getById(openParam)) {
      const first = repos.assignments.getAll().filter((a) => a.projectId === openParam).sort((a, b) => a.startDate.localeCompare(b.startDate))[0];
      if (first) setAnchor(first.startDate < today && first.endDate >= today ? today : first.startDate);
      setProjectDrawer({ id: openParam });
    }
    clearParams('open');
  }, [openParam]);

  const projectsById = useMemo(() => new Map(projects.map((p) => [p.id, p])), [projects]);
  const poById = useMemo(() => new Map(purchaseOrders.map((p) => [p.id, p])), [purchaseOrders]);
  const conflicts = useMemo(() => findConflicts(assignments, projectsById), [assignments, projectsById]);

  const { start, end, days } = useMemo(() => getVisibleDays(view, anchor), [view, anchor]);

  /** Resumo de materiais por projeto. */
  const materials = useMemo(() => {
    const m = new Map<string, MaterialSummary>();
    for (const p of projects) {
      const first = assignments.filter((a) => a.projectId === p.id).map((a) => a.startDate).sort()[0];
      m.set(p.id, summarizeMaterials(materialViews(p, poById, first, today)));
    }
    return m;
  }, [projects, assignments, poById, today]);

  // Alocações visíveis após filtros.
  const visible = useMemo(
    () =>
      assignments.filter((a) => {
        if (!rangesOverlap(a.startDate, a.endDate, start, end)) return false;
        const p = projectsById.get(a.projectId);
        if (!p) return false;
        if (statusFilter.length && !statusFilter.includes(p.status)) return false;
        if (onlyConflicts && !conflicts.has(a.id)) return false;
        if (onlyMaterials) {
          const s = materials.get(p.id);
          if (!s || s.toBuy + s.ordered === 0) return false;
        }
        return true;
      }),
    [assignments, start, end, projectsById, statusFilter, onlyConflicts, conflicts, onlyMaterials, materials],
  );

  // Linhas: ativos (filtrados) + inativos com alocação no período.
  const rows = useMemo(() => {
    const withItems = new Set(visible.map((a) => a.employeeId));
    return employees
      .filter((e) => (empFilter.length === 0 || empFilter.includes(e.id)) && (e.status === 'active' || withItems.has(e.id)))
      .filter((e) => !(onlyConflicts || onlyMaterials) || withItems.has(e.id))
      .sort((a, b) => (a.status === b.status ? a.name.localeCompare(b.name) : a.status === 'active' ? -1 : 1));
  }, [employees, empFilter, visible, onlyConflicts, onlyMaterials]);

  /** Ocupação (dias úteis alocados / disponíveis) no período visível. */
  const utilization = useMemo(() => {
    const total = businessDaysBetween(start, end);
    const map = new Map<string, { used: number; total: number }>();
    for (const e of employees) {
      const away = absences
        .filter((x) => x.employeeId === e.id && rangesOverlap(x.startDate, x.endDate, start, end))
        .reduce((s, x) => s + businessDaysBetween(x.startDate < start ? start : x.startDate, x.endDate > end ? end : x.endDate), 0);
      const used = assignments
        .filter((a) => a.employeeId === e.id && rangesOverlap(a.startDate, a.endDate, start, end) && projectsById.get(a.projectId)?.status !== 'canceled')
        .reduce((s, a) => s + businessDaysBetween(a.startDate < start ? start : a.startDate, a.endDate > end ? end : a.endDate), 0);
      map.set(e.id, { used, total: Math.max(0, total - away) });
    }
    return map;
  }, [employees, absences, assignments, projectsById, start, end]);

  // KPIs
  const inPeriod = assignments.filter((a) => rangesOverlap(a.startDate, a.endDate, start, end));
  const periodProjects = new Set(inPeriod.map((a) => a.projectId));
  const periodConflicts = inPeriod.filter((a) => conflicts.has(a.id)).length;
  const pendingMaterials = [...periodProjects].reduce((s, id) => {
    const m = materials.get(id);
    return s + (m ? m.toBuy + m.ordered : 0);
  }, 0);
  const awayToday = absences.filter((x) => x.startDate <= today && x.endDate >= today).length;

  // ───── Commit do drag-and-drop ─────
  const commit = (id: string, next: DragResult) => {
    const a = repos.assignments.getById(id);
    const p = a && projectsById.get(a.projectId);
    if (!a || !p) return;
    const emp = employees.find((e) => e.id === next.employeeId);
    const err = checkPlacement(emp, next.startDate, next.endDate, absences, a.employeeId);
    if (err === 'absence') return toast.error(t('calendar.toast.blockedAbsence', { employee: emp?.name ?? '' }));
    if (err) return toast.error(t('calendar.toast.inactiveTarget'));
    scheduleService.updateAssignment(id, next);
    if (next.employeeId !== a.employeeId) toast.success(t('calendar.toast.reassigned', { number: p.projectNumber, employee: emp?.name ?? '' }));
    else if (businessDaysBetween(next.startDate, next.endDate) !== businessDaysBetween(a.startDate, a.endDate))
      toast.success(t('calendar.toast.resized', { number: p.projectNumber, days: businessDaysBetween(next.startDate, next.endDate) }));
    else toast.success(t('calendar.toast.moved', { number: p.projectNumber, start: formatDate(next.startDate), end: formatDate(next.endDate) }));
    if (findConflicts(repos.assignments.getAll(), projectsById).has(id)) toast.error(t('calendar.toast.conflictCreated', { employee: emp?.name ?? '' }));
  };

  const periodLabel = view === 'month' ? formatMonthYear(anchor) : formatDateRange(start, end);
  const sortedEmployees = [...employees].sort((a, b) => (a.status === b.status ? a.name.localeCompare(b.name) : a.status === 'active' ? -1 : 1));
  const hasFilters = empFilter.length > 0 || statusFilter.length > 0 || onlyConflicts || onlyMaterials;
  const toggleIn = (list: string[], v: string) => (list.includes(v) ? list.filter((x) => x !== v) : [...list, v]);

  return (
    <>
      <PageHeader
        icon={CalendarRange}
        title={t('calendar.title')}
        description={t('calendar.description')}
        actions={
          <>
            <Button icon={Palmtree} onClick={() => setAbsenceDrawer({})}>
              {t('calendar.absences')}
            </Button>
            {canEdit && (
              <Button variant="primary" icon={Plus} onClick={() => setProjectDrawer({ defaults: { date: anchor >= start && anchor <= end ? anchor : start } })}>
                {t('calendar.newProject')}
              </Button>
            )}
          </>
        }
      />

      <div className="mb-4 grid grid-cols-2 gap-3 lg:grid-cols-4">
        <StatCard label={t('calendar.stats.projects')} value={periodProjects.size} icon={FolderKanban} tone="info" />
        <StatCard
          label={t('calendar.stats.materialsPending')}
          value={pendingMaterials}
          icon={Package}
          tone={pendingMaterials ? 'warning' : 'default'}
          onClick={() => setOnlyMaterials((v) => !v)}
          hint={onlyMaterials ? t('calendar.stats.filterActive') : undefined}
        />
        <StatCard
          label={t('calendar.stats.conflicts')}
          value={periodConflicts}
          icon={AlertTriangle}
          tone={periodConflicts ? 'danger' : 'default'}
          onClick={() => setOnlyConflicts((v) => !v)}
          hint={onlyConflicts ? t('calendar.stats.filterActive') : undefined}
        />
        <StatCard label={t('calendar.stats.onLeave')} value={awayToday} icon={Palmtree} onClick={() => setAbsenceDrawer({})} />
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
      <div className="card mb-3 flex flex-col gap-3 p-3 xl:flex-row xl:items-center">
        <div className="inline-flex max-w-full self-start overflow-x-auto rounded-lg bg-slate-100 p-1 dark:bg-slate-800" role="tablist">
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

        <div className="flex items-center gap-2">
          <Button size="sm" icon={ChevronLeft} onClick={() => setAnchor(shiftAnchor(view, anchor, -1))} aria-label={t('common.previous')} />
          <Button size="sm" onClick={() => setAnchor(today)}>
            {t('common.today')}
          </Button>
          <Button size="sm" icon={ChevronRight} onClick={() => setAnchor(shiftAnchor(view, anchor, 1))} aria-label={t('common.next')} />
          <h2 className="ml-1 text-base font-semibold whitespace-nowrap text-slate-900 dark:text-white">{periodLabel}</h2>
        </div>

        <div className="flex flex-wrap items-center gap-2 xl:ml-auto">
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
              {sortedEmployees.map((e) => {
                const on = empFilter.includes(e.id);
                return (
                  <button key={e.id} onClick={() => setEmpFilter(toggleIn(empFilter, e.id))} className="flex w-full items-center gap-2 rounded-md px-2 py-1.5 text-left text-sm hover:bg-slate-100 dark:hover:bg-slate-800" role="menuitemcheckbox" aria-checked={on}>
                    <span className={cn('flex size-4 items-center justify-center rounded border', on ? 'border-brand-500 bg-brand-500 text-slate-950' : 'border-slate-300 dark:border-slate-600')}>{on && <Check className="size-3" strokeWidth={3} />}</span>
                    <Avatar name={e.name} color={e.color} size="sm" muted={e.status === 'inactive'} />
                    <span className={cn('truncate', e.status === 'inactive' && 'text-slate-400')}>{e.name}</span>
                  </button>
                );
              })}
            </div>
          </Popover>

          <div className="flex flex-wrap gap-1" role="group" aria-label={t('calendar.filters.statuses')}>
            {enumValues('projectStatus').map((s) => {
              const on = statusFilter.includes(s);
              return (
                <button
                  key={s}
                  onClick={() => setStatusFilter(toggleIn(statusFilter, s))}
                  aria-pressed={on}
                  className={cn(
                    'rounded-full border px-2.5 py-1 text-xs font-medium transition-colors',
                    on ? 'border-slate-900 bg-slate-900 text-white dark:border-white dark:bg-white dark:text-slate-900' : 'border-slate-300 text-slate-600 hover:bg-slate-100 dark:border-slate-700 dark:text-slate-400 dark:hover:bg-slate-800',
                  )}
                >
                  {enumLabel(t, 'projectStatus', s)}
                </button>
              );
            })}
          </div>

          {hasFilters && (
            <Button size="sm" variant="ghost" icon={X} onClick={() => { setEmpFilter([]); setStatusFilter([]); setOnlyConflicts(false); setOnlyMaterials(false); }}>
              {t('common.clearFilters')}
            </Button>
          )}
        </div>
      </div>

      <p className="mb-2 text-xs text-slate-500">{canEdit ? t('calendar.dragHint') : t('auth.readOnly')}</p>

      {rows.length === 0 ? (
        <div className="card p-10 text-center text-sm text-slate-500">{t('calendar.emptyRows')}</div>
      ) : (
        <GanttChart
          view={view}
          days={days}
          today={today}
          employees={rows}
          assignments={visible}
          projectsById={projectsById}
          absences={absences}
          conflicts={conflicts}
          materials={materials}
          utilization={utilization}
          onOpenProject={(id, tab) => setProjectDrawer({ id, tab })}
          onCreate={(employeeId, date) => setProjectDrawer({ defaults: { employeeId, date } })}
          onOpenAbsence={(a) => setAbsenceDrawer({ editing: a })}
          onCommit={commit}
          readOnly={!canEdit}
        />
      )}

      <ProjectDrawer open={!!projectDrawer} projectId={projectDrawer?.id} initialTab={projectDrawer?.tab} defaults={projectDrawer?.defaults} onClose={() => setProjectDrawer(null)} />
      <AbsenceDrawer open={!!absenceDrawer} editing={absenceDrawer?.editing} onClose={() => setAbsenceDrawer(null)} />
    </>
  );
}
