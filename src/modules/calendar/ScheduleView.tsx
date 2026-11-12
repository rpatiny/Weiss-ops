import { useDroppable } from '@dnd-kit/core';
import { MapPinned, Plus } from 'lucide-react';
import { Avatar } from '@/components/ui/misc';
import { byRoute } from '@/domain/calendar';
import { useI18n } from '@/i18n';
import { cn } from '@/lib/cn';
import { isWeekend, parseISODate } from '@/lib/dates';
import { formatWeekday } from '@/lib/format';
import type { CalendarActivity, Employee } from '@/types/models';
import { ActivityCard } from './ActivityCard';
import { useCalendarCtx } from './CalendarContext';

interface Props {
  days: string[];
  employees: Employee[];
  /** Atividades filtradas, indexadas por `employeeId|date`. */
  byCell: Map<string, CalendarActivity[]>;
}

/** Grade de Escala: colaboradores nas linhas × dias nas colunas. */
export function ScheduleView({ days, employees, byCell }: Props) {
  const { t } = useI18n();
  const { today } = useCalendarCtx();

  return (
    <div className="card overflow-x-auto">
      <table className="w-full min-w-[900px] table-fixed border-collapse">
        <colgroup>
          <col className="w-52" />
          {days.map((d) => (
            <col key={d} />
          ))}
        </colgroup>
        <thead>
          <tr className="bg-slate-50 dark:bg-slate-800/40">
            <th className="sticky left-0 z-10 border-r border-b border-slate-200 bg-slate-50 px-3 py-2 text-left text-xs font-semibold tracking-wide text-slate-500 uppercase dark:border-slate-800 dark:bg-slate-900">
              {t('calendar.employeeColumn')}
            </th>
            {days.map((d) => (
              <th
                key={d}
                className={cn(
                  'border-r border-b border-slate-200 px-1 py-2 text-center last:border-r-0 dark:border-slate-800',
                  isWeekend(d) && 'bg-slate-100/80 dark:bg-slate-900/80',
                )}
              >
                <span className="block text-[11px] font-semibold tracking-wide text-slate-500 uppercase">{formatWeekday(d)}</span>
                <span className={cn('mt-0.5 inline-flex min-w-6 items-center justify-center rounded-full px-1 text-sm font-bold tabular-nums', d === today ? 'bg-brand-500 text-slate-950' : 'text-slate-800 dark:text-slate-200')}>
                  {parseISODate(d).getDate()}
                </span>
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {employees.map((e) => (
            <tr key={e.id} className="align-top">
              <th scope="row" className="sticky left-0 z-10 border-r border-b border-slate-200 bg-white px-3 py-2 text-left font-normal dark:border-slate-800 dark:bg-slate-900">
                <div className="flex items-center gap-2">
                  <Avatar name={e.name} color={e.color} size="sm" muted={e.status === 'inactive'} />
                  <div className="min-w-0">
                    <p className="truncate text-sm font-medium text-slate-900 dark:text-white">{e.name}</p>
                    <p className="truncate text-[11px] text-slate-500">{e.status === 'inactive' ? t('calendar.inactive') : e.role}</p>
                  </div>
                </div>
              </th>
              {days.map((d) => (
                <ScheduleCell key={d} employee={e} date={d} items={byCell.get(`${e.id}|${d}`) ?? []} />
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

function ScheduleCell({ employee, date, items }: { employee: Employee; date: string; items: CalendarActivity[] }) {
  const { t } = useI18n();
  const { onCreate, onOpenRoute } = useCalendarCtx();
  const inactive = employee.status === 'inactive';
  const { setNodeRef, isOver } = useDroppable({ id: `cell|${employee.id}|${date}`, data: { date, employeeId: employee.id }, disabled: inactive });
  const sorted = [...items].sort(byRoute);
  const routable = items.some((a) => a.status !== 'canceled');

  return (
    <td
      ref={setNodeRef}
      className={cn(
        'group/cell h-20 border-r border-b border-slate-200 p-1 align-top last:border-r-0 dark:border-slate-800',
        isWeekend(date) && 'bg-slate-50/70 dark:bg-slate-900/60',
        inactive && 'bg-[repeating-linear-gradient(45deg,transparent,transparent_6px,rgb(148_163_184/0.12)_6px,rgb(148_163_184/0.12)_12px)]',
        isOver && 'bg-brand-50 ring-2 ring-brand-500 ring-inset dark:bg-brand-500/10',
      )}
    >
      <div className="flex h-full flex-col gap-1">
        {sorted.map((a) => (
          <ActivityCard key={a.id} activity={a} variant="compact" />
        ))}
        <div className="mt-auto flex justify-end gap-0.5 opacity-100 transition-opacity lg:opacity-0 lg:group-hover/cell:opacity-100">
          {routable && (
            <button type="button" onClick={() => onOpenRoute(date, employee.id)} className="rounded p-0.5 text-slate-400 hover:bg-slate-200 hover:text-slate-700 dark:hover:bg-slate-700" title={t('calendar.route.title')} aria-label={t('calendar.route.title')}>
              <MapPinned className="size-3.5" />
            </button>
          )}
          {!inactive && (
            <button type="button" onClick={() => onCreate(date, employee.id)} className="rounded p-0.5 text-slate-400 hover:bg-slate-200 hover:text-slate-700 dark:hover:bg-slate-700" title={t('calendar.newActivity')} aria-label={t('calendar.newActivity')}>
              <Plus className="size-3.5" />
            </button>
          )}
        </div>
      </div>
    </td>
  );
}
