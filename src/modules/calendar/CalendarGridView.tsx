import { useDroppable } from '@dnd-kit/core';
import { MapPinned, Plus } from 'lucide-react';
import type { CalendarView } from '@/domain/calendar';
import { useI18n } from '@/i18n';
import { cn } from '@/lib/cn';
import { isWeekend, monthKey, parseISODate } from '@/lib/dates';
import { formatWeekday } from '@/lib/format';
import type { CalendarActivity } from '@/types/models';
import { ActivityCard, type CardVariant } from './ActivityCard';
import { useCalendarCtx } from './CalendarContext';

interface Props {
  view: Exclude<CalendarView, 'schedule'>;
  days: string[];
  /** Atividades já filtradas, agrupadas por data. */
  byDate: Map<string, CalendarActivity[]>;
  anchor: string;
}

const MONTH_MAX = 3;

/** Visões Semanal, Quinzenal e Mensal: semanas em linhas × 7 dias em colunas. */
export function CalendarGridView({ view, days, byDate, anchor }: Props) {
  const weeks: string[][] = [];
  for (let i = 0; i < days.length; i += 7) weeks.push(days.slice(i, i + 7));
  const variant: CardVariant = view === 'week' ? 'full' : view === 'biweekly' ? 'compact' : 'chip';

  return (
    <div className={cn('card overflow-x-auto', view === 'month' && 'overflow-x-auto')}>
      <div className={cn(view === 'month' ? 'min-w-[760px]' : 'lg:min-w-[900px]')}>
        {/* Cabeçalho de dias da semana (somente mês) */}
        {view === 'month' && (
          <div className="grid grid-cols-7 border-b border-slate-200 bg-slate-50 dark:border-slate-800 dark:bg-slate-800/40">
            {weeks[0]?.map((d) => (
              <div key={d} className="px-2 py-2 text-center text-xs font-semibold tracking-wide text-slate-500 uppercase">
                {formatWeekday(d)}
              </div>
            ))}
          </div>
        )}
        {weeks.map((week) => (
          <div
            key={week[0]}
            className={cn(
              'grid border-b border-slate-200 last:border-b-0 dark:border-slate-800',
              view === 'month' ? 'grid-cols-7' : 'grid-cols-1 lg:grid-cols-7',
            )}
          >
            {week.map((d) => (
              <DayCell key={d} date={d} items={byDate.get(d) ?? []} variant={variant} view={view} outside={view === 'month' && monthKey(d) !== monthKey(anchor)} />
            ))}
          </div>
        ))}
      </div>
    </div>
  );
}

function DayCell({ date, items, variant, view, outside }: { date: string; items: CalendarActivity[]; variant: CardVariant; view: Props['view']; outside: boolean }) {
  const { t } = useI18n();
  const { today, employeesById, onCreate, onOpenRoute, onFocusDate } = useCalendarCtx();
  const { setNodeRef, isOver } = useDroppable({ id: `day|${date}`, data: { date } });
  const isToday = date === today;
  const weekend = isWeekend(date);

  const sorted = [...items].sort((a, b) =>
    variant === 'chip'
      ? a.startTime.localeCompare(b.startTime)
      : (employeesById.get(a.employeeId)?.name ?? '').localeCompare(employeesById.get(b.employeeId)?.name ?? '') || a.routeOrder - b.routeOrder,
  );
  const shown = variant === 'chip' ? sorted.slice(0, MONTH_MAX) : sorted;
  const hidden = sorted.length - shown.length;
  const routable = items.some((a) => a.status !== 'canceled');

  return (
    <div
      ref={setNodeRef}
      className={cn(
        'group/day flex min-w-0 flex-col border-slate-200 transition-colors lg:border-r lg:last:border-r-0 dark:border-slate-800',
        view === 'month' ? 'min-h-28 border-r last:border-r-0' : view === 'week' ? 'border-b last:border-b-0 lg:min-h-[460px] lg:border-b-0' : 'border-b last:border-b-0 lg:min-h-56 lg:border-b-0',
        weekend && 'bg-slate-50/70 dark:bg-slate-900/60',
        outside && 'bg-slate-50 opacity-50 dark:bg-slate-950/40',
        isOver && 'bg-brand-50 ring-2 ring-brand-500 ring-inset dark:bg-brand-500/10',
      )}
    >
      <div className="flex items-center gap-1.5 px-2 pt-2 pb-1">
        <button
          type="button"
          onClick={() => onFocusDate(date)}
          className="flex items-baseline gap-1.5 rounded px-0.5 hover:text-brand-700"
          title={date}
        >
          {view !== 'month' && <span className="text-xs font-semibold tracking-wide text-slate-500 uppercase">{formatWeekday(date)}</span>}
          <span
            className={cn(
              'inline-flex min-w-6 items-center justify-center rounded-full px-1 text-sm font-bold tabular-nums',
              isToday ? 'bg-brand-500 text-slate-950' : 'text-slate-800 dark:text-slate-200',
            )}
          >
            {parseISODate(date).getDate()}
          </span>
        </button>
        {items.length > 0 && <span className="text-[10px] text-slate-400 tabular-nums">({items.length})</span>}
        <div className="ml-auto flex items-center gap-0.5 opacity-100 transition-opacity lg:opacity-0 lg:group-hover/day:opacity-100">
          {routable && (
            <button type="button" onClick={() => onOpenRoute(date)} className="rounded p-1 text-slate-400 hover:bg-slate-200 hover:text-slate-700 dark:hover:bg-slate-700" title={t('calendar.route.title')} aria-label={t('calendar.route.title')}>
              <MapPinned className="size-3.5" />
            </button>
          )}
          <button type="button" onClick={() => onCreate(date)} className="rounded p-1 text-slate-400 hover:bg-slate-200 hover:text-slate-700 dark:hover:bg-slate-700" title={t('calendar.newActivity')} aria-label={t('calendar.newActivity')}>
            <Plus className="size-3.5" />
          </button>
        </div>
      </div>
      <div className={cn('flex flex-1 flex-col px-1.5 pb-2', variant === 'chip' ? 'gap-0.5' : 'gap-1.5')}>
        {shown.map((a) => (
          <ActivityCard key={a.id} activity={a} variant={variant} />
        ))}
        {hidden > 0 && (
          <button type="button" onClick={() => onFocusDate(date)} className="px-1 text-left text-[11px] font-medium text-brand-700 hover:underline dark:text-brand-400">
            {t('calendar.more', { count: hidden })}
          </button>
        )}
      </div>
    </div>
  );
}
