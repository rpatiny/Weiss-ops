import { useCallback, useEffect, useMemo, useRef, useState, type PointerEvent as ReactPointerEvent } from 'react';
import { AlertTriangle, CheckCircle2, Clock, Lock, ShoppingCart, Truck } from 'lucide-react';
import { Avatar } from '@/components/ui/misc';
import { enumLabel } from '@/domain/labels';
import {
  applyDrag,
  checkPlacement,
  computeLanes,
  type DragMode,
  type MaterialSummary,
  type ScheduleView,
} from '@/domain/schedule';
import { useI18n } from '@/i18n';
import { cn } from '@/lib/cn';
import { businessDaysBetween, isWeekend, parseISODate } from '@/lib/dates';
import { formatDate, formatWeekday } from '@/lib/format';
import type { Absence, Employee, Project, ProjectAssignment } from '@/types/models';

/** Largura (px) de dia útil / fim de semana por visão. */
const GEOMETRY: Record<ScheduleView, { day: number; weekend: number }> = {
  week: { day: 150, weekend: 40 },
  biweekly: { day: 78, weekend: 26 },
  month: { day: 46, weekend: 16 },
};
const NAME_W = 210;
const LANE_H = 44;
const ROW_PAD = 6;

export interface DragResult {
  startDate: string;
  endDate: string;
  employeeId: string;
}

interface Props {
  view: ScheduleView;
  days: string[];
  today: string;
  employees: Employee[];
  assignments: ProjectAssignment[];
  projectsById: ReadonlyMap<string, Project>;
  absences: readonly Absence[];
  conflicts: ReadonlyMap<string, string[]>;
  materials: ReadonlyMap<string, MaterialSummary>;
  utilization: ReadonlyMap<string, { used: number; total: number }>;
  onOpenProject: (projectId: string, tab?: 'details' | 'team' | 'materials') => void;
  onCreate: (employeeId: string, date: string) => void;
  onOpenAbsence: (absence: Absence) => void;
  onCommit: (assignmentId: string, next: DragResult) => void;
}

interface DragState {
  id: string;
  mode: DragMode;
  originX: number;
  originY: number;
  orig: DragResult;
  preview: DragResult;
  moved: boolean;
}

export function GanttChart(props: Props) {
  const { view, days, today, employees, assignments, projectsById, absences, conflicts, materials, utilization } = props;
  const { t } = useI18n();
  const geo = GEOMETRY[view];
  const timelineRef = useRef<HTMLDivElement>(null);
  const [drag, setDrag] = useState<DragState | null>(null);
  const dragRef = useRef<DragState | null>(null);
  dragRef.current = drag;

  // ───── Geometria das colunas ─────
  const { offsets, widths, total, indexOf } = useMemo(() => {
    const widths = days.map((d) => (isWeekend(d) ? geo.weekend : geo.day));
    const offsets: number[] = [];
    let acc = 0;
    for (const w of widths) {
      offsets.push(acc);
      acc += w;
    }
    return { offsets, widths, total: acc, indexOf: new Map(days.map((d, i) => [d, i])) };
  }, [days, geo]);

  const first = days[0]!;
  const last = days[days.length - 1]!;
  const avgW = total / days.length;

  /** Índice (fracionário fora da grade) do dia sob a coordenada x da timeline. */
  const dayAt = useCallback(
    (x: number): number => {
      if (x < 0) return -Math.ceil(-x / avgW);
      if (x >= total) return days.length - 1 + Math.ceil((x - total + 1) / avgW);
      let lo = 0;
      let hi = offsets.length - 1;
      while (lo < hi) {
        const mid = (lo + hi + 1) >> 1;
        if (offsets[mid]! <= x) lo = mid;
        else hi = mid - 1;
      }
      return lo;
    },
    [avgW, total, days.length, offsets],
  );

  const xRange = (start: string, end: string) => {
    const s = start < first ? first : start;
    const e = end > last ? last : end;
    const i = indexOf.get(s) ?? 0;
    const j = indexOf.get(e) ?? days.length - 1;
    return { left: offsets[i]!, width: offsets[j]! + widths[j]! - offsets[i]!, clipStart: start < first, clipEnd: end > last };
  };

  // ───── Arraste (pointer events) ─────
  const startDrag = (e: ReactPointerEvent, a: ProjectAssignment, mode: DragMode) => {
    if (e.button !== 0) return;
    e.preventDefault();
    e.stopPropagation();
    const orig = { startDate: a.startDate, endDate: a.endDate, employeeId: a.employeeId };
    setDrag({ id: a.id, mode, originX: e.clientX, originY: e.clientY, orig, preview: orig, moved: false });
  };

  useEffect(() => {
    if (!drag) return;
    const onMove = (e: PointerEvent) => {
      const d = dragRef.current;
      const el = timelineRef.current;
      if (!d || !el) return;
      const left = el.getBoundingClientRect().left;
      const moved = d.moved || Math.abs(e.clientX - d.originX) > 4 || Math.abs(e.clientY - d.originY) > 4;
      const delta = dayAt(e.clientX - left) - dayAt(d.originX - left);
      const r = applyDrag(d.mode, d.orig.startDate, d.orig.endDate, delta);
      let employeeId = d.orig.employeeId;
      if (d.mode === 'move') {
        const row = document
          .elementsFromPoint(e.clientX, e.clientY)
          .map((n) => (n as HTMLElement).closest?.('[data-row-employee]') as HTMLElement | null)
          .find(Boolean);
        if (row?.dataset.rowEmployee) employeeId = row.dataset.rowEmployee;
      }
      setDrag({ ...d, moved, preview: { startDate: r.start, endDate: r.end, employeeId } });
    };
    const onUp = () => {
      const d = dragRef.current;
      setDrag(null);
      if (!d) return;
      if (!d.moved) {
        const a = assignments.find((x) => x.id === d.id);
        if (a) props.onOpenProject(a.projectId);
        return;
      }
      const p = d.preview;
      if (p.startDate !== d.orig.startDate || p.endDate !== d.orig.endDate || p.employeeId !== d.orig.employeeId) props.onCommit(d.id, p);
    };
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && setDrag(null);
    window.addEventListener('pointermove', onMove);
    window.addEventListener('pointerup', onUp, { once: true });
    window.addEventListener('keydown', onKey);
    return () => {
      window.removeEventListener('pointermove', onMove);
      window.removeEventListener('pointerup', onUp);
      window.removeEventListener('keydown', onKey);
    };
    // Reanexa somente quando um arraste começa/termina.
  }, [drag?.id, dayAt]);

  // Alocações efetivas (com a prévia do arraste aplicada).
  const effective = useMemo(
    () => assignments.map((a) => (drag && a.id === drag.id ? { ...a, ...drag.preview } : a)),
    [assignments, drag],
  );
  const empById = useMemo(() => new Map(employees.map((e) => [e.id, e])), [employees]);
  const previewInvalid = drag?.moved
    ? checkPlacement(empById.get(drag.preview.employeeId), drag.preview.startDate, drag.preview.endDate, absences, drag.orig.employeeId) !== null
    : false;

  return (
    <div className="card overflow-x-auto" style={{ cursor: drag?.moved ? (drag.mode === 'move' ? 'grabbing' : 'ew-resize') : undefined }}>
      <div style={{ width: NAME_W + total }} className={cn(drag?.moved && 'select-none')}>
        {/* Cabeçalho */}
        <div className="sticky top-0 z-20 flex border-b border-slate-200 bg-slate-50 dark:border-slate-800 dark:bg-slate-900">
          <div className="sticky left-0 z-10 flex shrink-0 items-end border-r border-slate-200 bg-slate-50 px-3 pb-2 text-xs font-semibold tracking-wide text-slate-500 uppercase dark:border-slate-800 dark:bg-slate-900" style={{ width: NAME_W }}>
            {t('calendar.employeeColumn')}
          </div>
          <div ref={timelineRef} className="relative h-12" style={{ width: total }}>
            {days.map((d, i) => {
              const we = isWeekend(d);
              const isToday = d === today;
              return (
                <div
                  key={d}
                  className={cn('absolute top-0 flex h-full flex-col items-center justify-center border-r border-slate-200 dark:border-slate-800', we && 'bg-slate-200/60 dark:bg-slate-800/70')}
                  style={{ left: offsets[i], width: widths[i] }}
                  title={formatDate(d)}
                >
                  {!(we && view === 'month') && <span className="text-[10px] font-semibold text-slate-500 uppercase">{view === 'month' ? formatWeekday(d).slice(0, 1) : formatWeekday(d)}</span>}
                  {!(we && view === 'month') && (
                    <span className={cn('inline-flex min-w-5 items-center justify-center rounded-full px-0.5 text-xs font-bold tabular-nums', isToday ? 'bg-brand-500 text-slate-950' : we ? 'text-slate-400' : 'text-slate-700 dark:text-slate-200')}>
                      {parseISODate(d).getDate()}
                    </span>
                  )}
                </div>
              );
            })}
          </div>
        </div>

        {/* Linhas */}
        {employees.map((emp) => {
          const rowItems = effective.filter((a) => a.employeeId === emp.id && a.endDate >= first && a.startDate <= last);
          const { lane, count } = computeLanes(rowItems);
          // Durante o arraste a linha nunca encolhe (evita que as linhas "pulem" sob o ponteiro).
          const baseCount = drag ? computeLanes(assignments.filter((a) => a.employeeId === emp.id && a.endDate >= first && a.startDate <= last)).count : 0;
          const height = Math.max(count, baseCount) * LANE_H + ROW_PAD * 2;
          const rowAbsences = absences.filter((x) => x.employeeId === emp.id && x.endDate >= first && x.startDate <= last);
          const inactive = emp.status === 'inactive';
          const util = utilization.get(emp.id);
          const isDropTarget = drag?.moved && drag.mode === 'move' && drag.preview.employeeId === emp.id && drag.orig.employeeId !== emp.id;

          return (
            <div key={emp.id} className="flex border-b border-slate-200 last:border-b-0 dark:border-slate-800">
              <div className="sticky left-0 z-10 flex shrink-0 items-center gap-2 border-r border-slate-200 bg-white px-3 dark:border-slate-800 dark:bg-slate-900" style={{ width: NAME_W, minHeight: height }}>
                <Avatar name={emp.name} color={emp.color} size="sm" muted={inactive} />
                <div className="min-w-0 flex-1">
                  <p className={cn('truncate text-sm font-medium', inactive ? 'text-slate-400' : 'text-slate-900 dark:text-white')}>{emp.name}</p>
                  <p className="truncate text-[11px] text-slate-500">{inactive ? t('calendar.inactive') : emp.role}</p>
                  {util && util.total > 0 && !inactive && (
                    <div className="mt-1 flex items-center gap-1.5" title={`${util.used}/${util.total}`}>
                      <div className="h-1 flex-1 overflow-hidden rounded-full bg-slate-200 dark:bg-slate-700">
                        <div className={cn('h-full rounded-full', util.used > util.total ? 'bg-red-500' : 'bg-brand-500')} style={{ width: `${Math.min(100, (util.used / util.total) * 100)}%` }} />
                      </div>
                      <span className="text-[10px] text-slate-500 tabular-nums">
                        {util.used}/{util.total}d
                      </span>
                    </div>
                  )}
                </div>
              </div>

              <div
                data-row-employee={emp.id}
                className={cn('relative', isDropTarget && (previewInvalid ? 'bg-red-50 dark:bg-red-950/30' : 'bg-brand-50 dark:bg-brand-500/10'))}
                style={{ width: total, height }}
              >
                {/* Grade de dias (clique em dia útil vazio cria projeto) */}
                {days.map((d, i) => {
                  const we = isWeekend(d);
                  return (
                    <div
                      key={d}
                      onClick={() => !we && !inactive && !drag && props.onCreate(emp.id, d)}
                      className={cn(
                        'absolute top-0 h-full border-r border-slate-100 dark:border-slate-800/80',
                        we ? 'bg-slate-100 dark:bg-slate-800/50' : !inactive && 'cursor-cell hover:bg-slate-50 dark:hover:bg-slate-800/30',
                        d === today && 'bg-brand-50/70 dark:bg-brand-500/5',
                      )}
                      style={{ left: offsets[i], width: widths[i] }}
                    />
                  );
                })}
                {inactive && <div className="pointer-events-none absolute inset-0 bg-[repeating-linear-gradient(45deg,transparent,transparent_6px,rgb(148_163_184/0.15)_6px,rgb(148_163_184/0.15)_12px)]" />}

                {/* Férias / ausências (bloqueio) */}
                {rowAbsences.map((x) => {
                  const r = xRange(x.startDate, x.endDate);
                  return (
                    <button
                      key={x.id}
                      type="button"
                      onClick={() => props.onOpenAbsence(x)}
                      className="absolute top-0 z-[1] flex h-full items-center gap-1 overflow-hidden border-x-2 border-cyan-500/60 bg-[repeating-linear-gradient(135deg,rgb(6_182_212/0.16),rgb(6_182_212/0.16)_6px,rgb(6_182_212/0.05)_6px,rgb(6_182_212/0.05)_12px)] px-2 text-left text-[11px] font-semibold text-cyan-800 dark:text-cyan-300"
                      style={{ left: r.left, width: r.width }}
                      title={`${enumLabel(t, 'absenceType', x.type)} ${formatDate(x.startDate)} – ${formatDate(x.endDate)}${x.note ? ` · ${x.note}` : ''}`}
                    >
                      <Lock className="size-3 shrink-0" />
                      <span className="truncate">
                        {enumLabel(t, 'absenceType', x.type)} · {t('calendar.absence.until', { date: formatDate(x.endDate) })}
                      </span>
                    </button>
                  );
                })}

                {/* Barras de projeto */}
                {rowItems.map((a) => {
                  const p = projectsById.get(a.projectId);
                  if (!p) return null;
                  const r = xRange(a.startDate, a.endDate);
                  const isDragging = drag?.id === a.id && drag.moved;
                  const locked = p.status === 'completed' || p.status === 'canceled';
                  const hasConflict = !isDragging && conflicts.has(a.id);
                  const bizDays = businessDaysBetween(a.startDate, a.endDate);
                  const summary = materials.get(p.id);
                  const compact = r.width < 90;
                  const weekendOverlays = days
                    .map((d, i) => ({ d, i }))
                    .filter(({ d }) => isWeekend(d) && d > a.startDate && d < a.endDate);

                  return (
                    <div
                      key={a.id}
                      onPointerDown={(e) => !locked && startDrag(e, a, 'move')}
                      onClick={(e) => {
                        // Projetos travados não iniciam arraste: o clique abre direto.
                        if (locked) {
                          e.stopPropagation();
                          props.onOpenProject(p.id);
                        }
                      }}
                      className={cn(
                        'group absolute z-[2] flex items-center overflow-hidden rounded-md text-white shadow-sm transition-[box-shadow] select-none',
                        locked ? 'cursor-pointer opacity-70 saturate-50' : 'cursor-grab active:cursor-grabbing',
                        isDragging && 'pointer-events-none z-30 shadow-2xl ring-2 ring-offset-1 dark:ring-offset-slate-900',
                        isDragging && (previewInvalid ? 'opacity-60 ring-red-500 ring-dashed' : 'ring-brand-400'),
                        hasConflict && 'ring-2 ring-red-500 ring-offset-1 dark:ring-offset-slate-900',
                        p.status === 'canceled' && 'line-through',
                      )}
                      style={{
                        left: r.left + 1,
                        width: Math.max(8, r.width - 2),
                        top: ROW_PAD + (lane.get(a.id) ?? 0) * LANE_H,
                        height: LANE_H - 6,
                        backgroundColor: p.color,
                        touchAction: 'none',
                        borderTopLeftRadius: r.clipStart ? 0 : undefined,
                        borderBottomLeftRadius: r.clipStart ? 0 : undefined,
                        borderTopRightRadius: r.clipEnd ? 0 : undefined,
                        borderBottomRightRadius: r.clipEnd ? 0 : undefined,
                      }}
                      title={`${p.projectNumber} · ${p.customer}\n${formatDate(a.startDate)} – ${formatDate(a.endDate)} · ${t('calendar.businessDays', { count: bizDays })}${p.description ? `\n${p.description}` : ''}${hasConflict ? `\n⚠ ${t('calendar.conflict')}` : ''}`}
                    >
                      {/* Fins de semana dentro da barra (não contam) */}
                      {weekendOverlays.map(({ d, i }) => (
                        <span key={d} className="pointer-events-none absolute top-0 h-full bg-white/35 dark:bg-slate-950/40" style={{ left: offsets[i]! - r.left - 1, width: widths[i] }} />
                      ))}

                      {!locked && !r.clipStart && (
                        <span onPointerDown={(e) => startDrag(e, a, 'resize-start')} className="absolute top-0 left-0 z-10 h-full w-2 cursor-ew-resize bg-black/0 hover:bg-black/25" />
                      )}

                      <div className="relative flex min-w-0 flex-1 items-center gap-1.5 px-2">
                        {hasConflict && <AlertTriangle className="size-3.5 shrink-0 text-white" />}
                        <div className="min-w-0 flex-1 leading-tight">
                          <p className="truncate text-xs font-semibold drop-shadow-sm">{compact ? p.projectNumber.split('-').pop() : p.customer}</p>
                          {!compact && (
                            <p className="truncate font-mono text-[10px] opacity-90">
                              {p.projectNumber} · {bizDays}d
                            </p>
                          )}
                        </div>
                        {summary && summary.total > 0 && (
                          <MaterialBadge summary={summary} compact={compact || view === 'month'} corner={r.width < 70} onOpen={() => props.onOpenProject(p.id, 'materials')} />
                        )}
                      </div>

                      {!locked && !r.clipEnd && (
                        <span onPointerDown={(e) => startDrag(e, a, 'resize-end')} className="absolute top-0 right-0 z-10 h-full w-2 cursor-ew-resize bg-black/0 hover:bg-black/25" />
                      )}
                    </div>
                  );
                })}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}

/** Indicador de materiais no retângulo do projeto (abre a aba Materiais). */
function MaterialBadge({ summary, compact, corner, onOpen }: { summary: MaterialSummary; compact: boolean; corner?: boolean; onOpen: () => void }) {
  const { t } = useI18n();
  const [Icon, cls, label] =
    summary.toBuy > 0
      ? [ShoppingCart, 'bg-red-600', t('calendar.badge.toBuy', { count: summary.toBuy })]
      : summary.late > 0
        ? [Clock, 'bg-red-600', t('calendar.badge.late', { count: summary.late })]
        : summary.ordered > 0
          ? [Truck, 'bg-amber-500 text-slate-950', t('calendar.badge.ordered', { count: summary.ordered })]
          : [CheckCircle2, 'bg-green-600', t('calendar.badge.ok')];
  const count = summary.toBuy || summary.late || summary.ordered;
  return (
    <button
      type="button"
      onPointerDown={(e) => e.stopPropagation()}
      onClick={(e) => {
        e.stopPropagation();
        onOpen();
      }}
      title={`${t('calendar.materialsButton')} — ${label}`}
      aria-label={`${t('calendar.materialsButton')} — ${label}`}
      className={cn(
        'z-10 inline-flex shrink-0 items-center gap-0.5 rounded text-[10px] font-bold text-white shadow ring-1 ring-white/40 hover:brightness-110',
        corner ? 'absolute top-0.5 right-0.5 p-0.5' : 'relative px-1 py-0.5',
        cls,
      )}
    >
      <Icon className={corner ? 'size-2.5' : 'size-3'} />
      {count > 0 && !corner && count}
      {!compact && count > 0 && <span className="hidden font-medium xl:inline">{label.replace(String(count), '').trim()}</span>}
    </button>
  );
}
