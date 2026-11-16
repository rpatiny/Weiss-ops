import { useMemo, useState } from 'react';
import { CheckCheck, ChevronDown, ChevronRight, Clock3, FileSpreadsheet } from 'lucide-react';
import { Badge } from '@/components/ui/Badge';
import { Avatar, EmptyState } from '@/components/ui/misc';
import { useCollection } from '@/data/hooks';
import { reportCheck } from '@/domain/hoursReport';
import { entryMinutes, formatMinutes, jobProgress, localDay } from '@/domain/timeTracking';
import { useI18n } from '@/i18n';
import { cn } from '@/lib/cn';
import { formatDate, getFormatLocale } from '@/lib/format';
import { usePersistentState } from '@/lib/usePersistentState';
import type { TimeEntry } from '@/types/models';
import { HoursReportButton } from './HoursReportButton';

type Filter = 'all' | 'complete' | 'open';
const FILTERS: Filter[] = ['complete', 'open', 'all'];
const isFilter = (v: unknown): v is Filter => FILTERS.includes(v as Filter);
const timeOf = (iso: string) => new Date(iso).toLocaleTimeString(getFormatLocale(), { hour: '2-digit', minute: '2-digit' });
const stamp = (iso?: string) => (iso ? `${formatDate(localDay(iso))} ${timeOf(iso)}` : '—');

/**
 * Relatório na tela: projeto → fases (duração, técnicos, início/fim) → cada entrada e saída.
 * Em andamento pode ser conferido aqui, mas só projeto concluído tem exportação.
 */
export function ReportTab() {
  const { t } = useI18n();
  const projects = useCollection('projects');
  const phases = useCollection('workPhases');
  const entries = useCollection('timeEntries');
  const employees = useCollection('employees');
  const [filter, setFilter] = usePersistentState<Filter>('timesheet.reportFilter', 'complete', isFilter);
  const [openProject, setOpenProject] = useState<string | null>(null);
  const [openPhase, setOpenPhase] = useState<string | null>(null);
  const emp = useMemo(() => new Map(employees.map((e) => [e.id, e])), [employees]);

  const rows = useMemo(
    () =>
      projects
        .filter((p) => entries.some((e) => e.projectId === p.id))
        .map((p) => {
          const prog = jobProgress(p.id, phases, entries);
          const mine = entries.filter((e) => e.projectId === p.id);
          const exportable = reportCheck(p.id, { workPhases: phases, timeEntries: entries }).ok;
          return { p, prog, mine, exportable, total: mine.reduce((s, e) => s + entryMinutes(e), 0) };
        })
        .filter((r) => (filter === 'all' ? true : filter === 'complete' ? r.exportable : !r.exportable))
        .sort((a, b) => a.p.projectNumber.localeCompare(b.p.projectNumber)),
    [projects, phases, entries, filter],
  );

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <p className="max-w-3xl text-sm text-slate-500">{t('timesheet.reportTabHint')}</p>
        <div className="flex gap-1 rounded-lg bg-slate-100 p-1 dark:bg-slate-800">
          {FILTERS.map((f) => (
            <button
              key={f}
              onClick={() => setFilter(f)}
              aria-pressed={filter === f}
              className={cn('rounded-md px-3 py-1.5 text-sm font-medium', filter === f ? 'bg-white text-slate-900 shadow-sm dark:bg-slate-700 dark:text-white' : 'text-slate-500')}
            >
              {t(`timesheet.repFilter.${f}`)}
            </button>
          ))}
        </div>
      </div>

      {rows.length === 0 ? (
        <EmptyState icon={Clock3} title={t('timesheet.rep.noData')} />
      ) : (
        <div className="card divide-y divide-slate-100 overflow-hidden dark:divide-slate-800">
          {rows.map(({ p, prog, mine, exportable, total }) => {
            const expanded = openProject === p.id;
            return (
              <section key={p.id}>
                <div className="flex flex-wrap items-center gap-3 px-4 py-3">
                  <button onClick={() => setOpenProject(expanded ? null : p.id)} aria-expanded={expanded} className="flex min-w-0 flex-1 items-center gap-3 text-left">
                    {expanded ? <ChevronDown className="size-5 shrink-0 text-slate-400" /> : <ChevronRight className="size-5 shrink-0 text-slate-400" />}
                    <span className="h-8 w-1.5 shrink-0 rounded-full" style={{ backgroundColor: p.color }} />
                    <span className="min-w-0">
                      <span className="block font-mono text-xs text-slate-500">{p.projectNumber}</span>
                      <span className="block truncate font-semibold text-slate-900 dark:text-white">{p.customer}</span>
                    </span>
                  </button>
                  <Badge tone={exportable ? 'green' : 'blue'} dot>
                    {exportable ? t('timesheet.rep.complete') : `${t('timesheet.rep.inProgress')} · ${t('projects.phasesProgress', { done: prog.done, total: prog.total })}`}
                  </Badge>
                  <span className="w-20 text-right font-semibold text-slate-900 tabular-nums dark:text-white">{formatMinutes(total)}</span>
                  {exportable ? <HoursReportButton projectId={p.id} /> : <span className="text-xs text-slate-400">{t('timesheet.inProgressNoExport')}</span>}
                </div>

                {expanded && (
                  <div className="overflow-x-auto bg-slate-50/60 px-4 pb-4 dark:bg-slate-900/40">
                    <table className="w-full min-w-[680px] text-sm">
                      <thead>
                        <tr className="text-left text-xs text-slate-500 uppercase">
                          <th className="py-2 pr-2 font-semibold">{t('timesheet.rep.phase')}</th>
                          <th className="py-2 pr-2 text-right font-semibold">{t('timesheet.rep.duration')}</th>
                          <th className="py-2 pr-2 font-semibold">{t('timesheet.rep.first')}</th>
                          <th className="py-2 pr-2 font-semibold">{t('timesheet.rep.last')}</th>
                          <th className="py-2 font-semibold">{t('timesheet.rep.who')}</th>
                        </tr>
                      </thead>
                      <tbody>
                        {prog.phases.map(({ phase, state, minutes, doneAt, workers }) => {
                          const list: TimeEntry[] = mine.filter((e) => e.phaseId === phase.id).sort((a, b) => a.start.localeCompare(b.start));
                          const key = `${p.id}:${phase.id}`;
                          const phaseOpen = openPhase === key;
                          return (
                            <PhaseRows key={phase.id}>
                              <tr className="border-t border-slate-200 dark:border-slate-800">
                                <td className="py-2 pr-2">
                                  <button
                                    disabled={!list.length}
                                    onClick={() => setOpenPhase(phaseOpen ? null : key)}
                                    aria-expanded={phaseOpen}
                                    className="flex items-center gap-1.5 font-medium text-slate-800 disabled:text-slate-400 dark:text-slate-100"
                                  >
                                    {list.length ? phaseOpen ? <ChevronDown className="size-4" /> : <ChevronRight className="size-4" /> : <span className="w-4" />}
                                    {phase.name}
                                    {state === 'done' && <CheckCheck className="size-4 text-green-600" aria-label={t('timesheet.state.done')} />}
                                    {state === 'active' && <Badge tone="blue">{t('timesheet.state.active')}</Badge>}
                                  </button>
                                </td>
                                <td className="py-2 pr-2 text-right font-semibold tabular-nums">{minutes ? formatMinutes(minutes) : '—'}</td>
                                <td className="py-2 pr-2 tabular-nums">{stamp(list[0]?.start)}</td>
                                <td className="py-2 pr-2 tabular-nums">{stamp(doneAt)}</td>
                                <td className="py-2">
                                  <span className="flex flex-wrap gap-1">
                                    {workers.map((id) => (
                                      <span key={id} className="inline-flex items-center gap-1">
                                        <Avatar name={emp.get(id)?.name ?? '?'} color={emp.get(id)?.color ?? '#64748b'} size="sm" />
                                        <span className="text-xs">{emp.get(id)?.name.split(' ')[0]}</span>
                                      </span>
                                    ))}
                                  </span>
                                </td>
                              </tr>
                              {phaseOpen &&
                                list.map((e) => (
                                  <tr key={e.id} className="text-xs text-slate-600 dark:text-slate-300">
                                    <td className="py-1 pr-2 pl-6">{emp.get(e.employeeId)?.name}</td>
                                    <td className="py-1 pr-2 text-right tabular-nums">{formatMinutes(entryMinutes(e))}</td>
                                    <td className="py-1 pr-2 tabular-nums">{stamp(e.start)}</td>
                                    <td className="py-1 pr-2 tabular-nums">{e.end ? stamp(e.end) : t('timesheet.inProgress')}</td>
                                    <td className="py-1">
                                      {e.completesPhase && <Badge tone="green">{t('timesheet.state.done')}</Badge>} {e.source === 'manual' && <Badge tone="violet">{t('timesheet.source.manual')}</Badge>}
                                    </td>
                                  </tr>
                                ))}
                            </PhaseRows>
                          );
                        })}
                        <tr className="border-t-2 border-slate-300 font-semibold dark:border-slate-700">
                          <td className="py-2 pr-2">{t('timesheet.total')}</td>
                          <td className="py-2 pr-2 text-right tabular-nums">{formatMinutes(total)}</td>
                          <td colSpan={3} />
                        </tr>
                      </tbody>
                    </table>
                    {!exportable && (
                      <p className="mt-2 flex items-center gap-1.5 text-xs text-slate-500">
                        <FileSpreadsheet className="size-3.5" /> {t('timesheet.reportHint')}
                      </p>
                    )}
                  </div>
                )}
              </section>
            );
          })}
        </div>
      )}
    </div>
  );
}

const PhaseRows = ({ children }: { children: React.ReactNode }) => <>{children}</>;
