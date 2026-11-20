import { useMemo, useState } from 'react';
import { CheckCheck, ChevronDown, ChevronRight, Clock3, FileSpreadsheet, Pencil, Search, TriangleAlert, Unlock } from 'lucide-react';
import { useCan } from '@/app/session';
import { Badge } from '@/components/ui/Badge';
import { Button } from '@/components/ui/Button';
import { Field, Input } from '@/components/ui/Field';
import { Modal } from '@/components/ui/Modal';
import { Avatar, EmptyState } from '@/components/ui/misc';
import { useToast } from '@/components/ui/Toast';
import { useCollection } from '@/data/hooks';
import { ForecastMeter } from '@/components/ui/ForecastMeter';
import { reportCheck } from '@/domain/hoursReport';
import { isProjectActive } from '@/domain/purchasing';
import { currentJobOf, entryMinutes, isOffSchedule, totalForecastHours, formatMinutes, jobFlag, localDay, needsReview, timesheetService, type JobFlag } from '@/domain/timeTracking';
import { useI18n } from '@/i18n';
import { cn } from '@/lib/cn';
import { formatDate, getFormatLocale } from '@/lib/format';
import type { Employee, Project, TimeEntry } from '@/types/models';
import { FlowFlag } from './Flags';
import { HoursReportButton } from './HoursReportButton';

export type ProjectFilter = 'active' | 'working' | 'waiting' | 'complete' | 'all';
export const PROJECT_FILTERS: ProjectFilter[] = ['active', 'working', 'waiting', 'complete', 'all'];
export const isProjectFilter = (v: unknown): v is ProjectFilter => PROJECT_FILTERS.includes(v as ProjectFilter);

const timeOf = (iso: string) => new Date(iso).toLocaleTimeString(getFormatLocale(), { hour: '2-digit', minute: '2-digit' });
const stamp = (iso?: string) => (iso ? `${formatDate(localDay(iso))} ${timeOf(iso)}` : '—');
/** Minutos que contam: apontamento esquecido aberto ("para corrigir") fica fora dos totais. */
const counted = (e: TimeEntry) => (needsReview(e) ? 0 : entryMinutes(e));

/** Horas por engenheiro numa lista de apontamentos (maior primeiro). */
function byEngineer(list: readonly TimeEntry[]): { id: string; minutes: number }[] {
  const m = new Map<string, number>();
  for (const e of list) m.set(e.employeeId, (m.get(e.employeeId) ?? 0) + counted(e));
  return [...m.entries()].map(([id, minutes]) => ({ id, minutes })).sort((a, b) => b.minutes - a.minutes);
}

/**
 * Horas da oficina POR PROJETO (visão principal): o engenheiro pode mudar de uma fase para outra, o projeto é o que fica.
 * Projeto → fases (estado, horas, quem trabalhou e quanto) → cada entrada/saída (corrigir).
 */
export function ByProjectTab({ onEditEntry, filter, setFilter, actions }: { onEditEntry: (e: TimeEntry) => void; filter: ProjectFilter; setFilter: (f: ProjectFilter) => void; actions?: React.ReactNode }) {
  const { t } = useI18n();
  const projects = useCollection('projects');
  const phases = useCollection('workPhases');
  const entries = useCollection('timeEntries');
  const employees = useCollection('employees');
  const [query, setQuery] = useState('');
  const [open, setOpen] = useState<string | null>(null);
  const emp = useMemo(() => new Map(employees.map((e) => [e.id, e])), [employees]);
  const prjById = useMemo(() => new Map(projects.map((p) => [p.id, p])), [projects]);
  const active = filter;

  const rows = useMemo(() => {
    const q = query.trim().toLowerCase();
    return projects
      // Arquivados ficam no Arquivo (tela Projects), não aqui.
      .filter((p) => !p.archived && entries.some((e) => e.projectId === p.id))
      .map((p) => {
        const mine = entries.filter((e) => e.projectId === p.id);
        const { flag, progress } = jobFlag(p.id, phases, entries);
        return {
          p,
          mine,
          flag,
          progress,
          total: mine.reduce((s, e) => s + counted(e), 0),
          toFix: mine.filter(needsReview).length,
          engineers: byEngineer(mine),
          onItNow: mine.filter((e) => !e.end && !needsReview(e)),
          holders: employees.filter((e) => currentJobOf(e.id, entries, phases, prjById) === p.id),
          exportable: reportCheck(p.id, { workPhases: phases, timeEntries: entries }).ok,
        };
      })
      .filter((r) => {
        if (q && !`${r.p.projectNumber} ${r.p.customer} ${r.p.description}`.toLowerCase().includes(q)) return false;
        if (active === 'all') return true;
        if (active === 'complete') return r.flag === 'ready';
        if (r.flag === 'ready' || !isProjectActive(r.p)) return false;
        return active === 'active' || r.flag === active;
      })
      // Parado esperando alguém primeiro (pede ação), depois em andamento, depois o resto; dentro, pelo nº do projeto.
      .sort((a, b) => rank(a.flag) - rank(b.flag) || a.p.projectNumber.localeCompare(b.p.projectNumber));
  }, [projects, phases, entries, employees, prjById, query, active]);

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center gap-3">
        <div className="relative min-w-[14rem] flex-1">
          <Search className="pointer-events-none absolute top-1/2 left-3 size-4 -translate-y-1/2 text-slate-400" />
          <input className="input pl-9" value={query} onChange={(e) => setQuery(e.target.value)} placeholder={t('timesheet.byProject.search')} aria-label={t('timesheet.byProject.search')} />
        </div>
        {(
          <div className="flex flex-wrap gap-1 rounded-lg bg-slate-100 p-1 dark:bg-slate-800">
            {PROJECT_FILTERS.map((f) => (
              <button
                key={f}
                onClick={() => setFilter(f)}
                aria-pressed={filter === f}
                className={cn('rounded-md px-3 py-1.5 text-sm font-medium whitespace-nowrap', filter === f ? 'bg-white text-slate-900 shadow-sm dark:bg-slate-700 dark:text-white' : 'text-slate-500')}
              >
                {t(`timesheet.byProject.filters.${f}`)}
              </button>
            ))}
          </div>
        )}
        {actions}
      </div>

      {rows.length === 0 ? (
        <EmptyState icon={Clock3} title={t('timesheet.byProject.empty')} />
      ) : (
        <ul className="space-y-3">
          {rows.map((r) => (
            <ProjectRow key={r.p.id} r={r} emp={emp} expanded={open === r.p.id} onToggle={() => setOpen(open === r.p.id ? null : r.p.id)} onEditEntry={onEditEntry} />
          ))}
        </ul>
      )}
    </div>
  );
}

const rank = (f: JobFlag) => (f === 'waiting' ? 0 : f === 'working' ? 1 : f === 'not_started' ? 2 : 3);

type Row = {
  p: Project;
  mine: TimeEntry[];
  flag: JobFlag;
  progress: ReturnType<typeof jobFlag>['progress'];
  total: number;
  toFix: number;
  engineers: { id: string; minutes: number }[];
  onItNow: TimeEntry[];
  holders: Employee[];
  exportable: boolean;
};

function ProjectRow({ r, emp, expanded, onToggle, onEditEntry }: { r: Row; emp: Map<string, Employee>; expanded: boolean; onToggle: () => void; onEditEntry: (e: TimeEntry) => void }) {
  const { t } = useI18n();
  const assignments = useCollection('assignments');
  const toast = useToast();
  const allowed = useCan()('time.manage');
  const [openPhase, setOpenPhase] = useState<string | null>(null);
  const [unlocking, setUnlocking] = useState<Employee | null>(null);
  const [note, setNote] = useState('');
  const { p, progress } = r;
  const pct = (progress.done / Math.max(1, progress.total)) * 100;

  return (
    <li className="card overflow-hidden">
      <div className="flex flex-wrap items-center gap-x-4 gap-y-2 p-4">
        <button onClick={onToggle} aria-expanded={expanded} className="flex min-w-[14rem] flex-1 items-center gap-3 text-left">
          {expanded ? <ChevronDown className="size-5 shrink-0 text-slate-400" /> : <ChevronRight className="size-5 shrink-0 text-slate-400" />}
          <span className="h-10 w-1.5 shrink-0 rounded-full" style={{ backgroundColor: p.color }} />
          <span className="min-w-0">
            <span className="block font-mono text-xs text-slate-500">{p.projectNumber}</span>
            <span className="block truncate font-semibold text-slate-900 dark:text-white">{p.customer}</span>
            {p.description && <span className="block truncate text-xs text-slate-500">{p.description}</span>}
          </span>
        </button>

        {/* Andamento */}
        <div className="w-44 shrink-0">
          <div className="flex items-center justify-between text-xs text-slate-500">
            <span>{t('projects.phasesProgress', { done: progress.done, total: progress.total })}</span>
          </div>
          <div className="mt-1 h-1.5 overflow-hidden rounded-full bg-slate-100 dark:bg-slate-800">
            <div className="h-full rounded-full bg-green-500" style={{ width: `${pct}%` }} />
          </div>
          <div className="mt-1.5">
            <FlowFlag flag={r.flag} next={r.flag === 'waiting' ? progress.next?.name : undefined} />
          </div>
        </div>

        {/* Engenheiros envolvidos (horas de cada um) */}
        <div className="flex min-w-[10rem] flex-wrap items-center gap-1.5">
          {r.engineers.map(({ id, minutes }) => {
            const e = emp.get(id);
            const live = r.onItNow.some((x) => x.employeeId === id);
            return (
              <span key={id} className={cn('inline-flex items-center gap-1 rounded-full py-0.5 pr-2 pl-0.5 text-xs', live ? 'bg-blue-50 ring-1 ring-blue-300 dark:bg-blue-500/10 dark:ring-blue-500/40' : 'bg-slate-100 dark:bg-slate-800')} title={live ? t('timesheet.byProject.onItNow') : undefined}>
                <Avatar name={e?.name ?? '?'} color={e?.color ?? '#64748b'} size="sm" />
                <span className="font-medium text-slate-700 dark:text-slate-200">{e?.name.split(' ')[0]}</span>
                <span className="text-slate-500 tabular-nums">{formatMinutes(minutes)}</span>
              </span>
            );
          })}
        </div>

        <div className="ml-auto flex items-center gap-3">
          {r.toFix > 0 && (
            <Badge tone="amber">
              <TriangleAlert className="mr-0.5 inline size-3" /> {t('timesheet.byProject.toFix', { count: r.toFix })}
            </Badge>
          )}
          <span className="text-right">
            <span className="block text-[11px] text-slate-500 uppercase">{t('timesheet.total')}</span>
            {totalForecastHours(r.p) > 0 ? (
              <ForecastMeter minutes={r.total} hours={totalForecastHours(r.p, progress.phases.map((x) => x.phase.id))} />
            ) : (
              <span className="text-lg font-bold text-slate-900 tabular-nums dark:text-white">{formatMinutes(r.total)}</span>
            )}
          </span>
        </div>
      </div>

      {expanded && (
        <div className="border-t border-slate-100 bg-slate-50/60 px-4 pt-2 pb-4 dark:border-slate-800 dark:bg-slate-900/40">
          {/* Celular: uma fase por bloco (sem rolagem lateral) */}
          <ol className="divide-y divide-slate-200 sm:hidden dark:divide-slate-800">
            {progress.phases.map(({ phase, state, doneAt }, i) => {
              const list = r.mine.filter((e) => e.phaseId === phase.id).sort((a, b) => a.start.localeCompare(b.start));
              const minutes = list.reduce((s, e) => s + counted(e), 0);
              const isOpen = openPhase === phase.id;
              return (
                <li key={phase.id} className="py-2.5">
                  <button disabled={!list.length} onClick={() => setOpenPhase(isOpen ? null : phase.id)} aria-expanded={isOpen} className="flex w-full items-center gap-1.5 text-left disabled:opacity-60">
                    <span className="text-xs text-slate-400 tabular-nums">{i + 1}.</span>
                    <span className={cn('font-medium', state === 'pending' ? 'text-slate-400' : 'text-slate-900 dark:text-white')}>{phase.name}</span>
                    {state === 'done' && <CheckCheck className="size-4 text-green-600" />}
                    {state === 'active' && <Badge tone="blue">{t('timesheet.state.active')}</Badge>}
                    <ForecastMeter className="ml-auto" minutes={minutes} hours={r.p.phaseForecast?.[phase.id]} compact />
                  </button>
                  {list.length > 0 && (
                    <p className="mt-1 flex flex-wrap gap-x-3 gap-y-1 pl-4 text-xs text-slate-600 dark:text-slate-300">
                      {byEngineer(list).map(({ id, minutes: m }) => (
                        <span key={id} className="inline-flex items-center gap-1">
                          <Avatar name={emp.get(id)?.name ?? '?'} color={emp.get(id)?.color ?? '#64748b'} size="sm" />
                          {emp.get(id)?.name.split(' ')[0]} <span className="text-slate-500 tabular-nums">{formatMinutes(m)}</span>
                        </span>
                      ))}
                      {doneAt && <span className="text-slate-500">✓ {stamp(doneAt)}</span>}
                    </p>
                  )}
                  {isOpen && (
                    <ul className="mt-2 space-y-1 pl-4">
                      {list.map((e) => (
                        <li key={e.id} className={cn('flex items-center gap-2 rounded-md px-2 py-1 text-xs', needsReview(e) ? 'bg-amber-50 dark:bg-amber-500/10' : 'bg-white dark:bg-slate-900')}>
                          <span className="min-w-0 flex-1">
                            <span className="font-medium">{emp.get(e.employeeId)?.name}</span>
                            {isOffSchedule(e, assignments) && (
                              <Badge tone="red" className="ml-1.5">
                                {t('timesheet.offSchedule')}
                              </Badge>
                            )}
                            <span className="block text-slate-500 tabular-nums">
                              {stamp(e.start)} → {e.end ? timeOf(e.end) : needsReview(e) ? t('timesheet.byProject.forgotOut') : t('timesheet.inProgress')}
                            </span>
                          </span>
                          <span className="tabular-nums">{needsReview(e) ? '—' : formatMinutes(entryMinutes(e))}</span>
                          {allowed && <Button size="sm" variant="ghost" icon={Pencil} onClick={() => onEditEntry(e)} aria-label={t('common.edit')} />}
                        </li>
                      ))}
                    </ul>
                  )}
                </li>
              );
            })}
          </ol>

          <div className="hidden overflow-x-auto sm:block">
            <table className="w-full min-w-[720px] text-sm">
              <thead>
                <tr className="text-left text-xs text-slate-500 uppercase">
                  <th className="py-2 pr-2 font-semibold">{t('timesheet.rep.phase')}</th>
                  <th className="py-2 pr-2 text-right font-semibold">{t('timesheet.rep.duration')}</th>
                  <th className="py-2 pr-2 font-semibold">{t('timesheet.byProject.engineers')}</th>
                  <th className="py-2 pr-2 font-semibold">{t('timesheet.rep.first')}</th>
                  <th className="py-2 font-semibold">{t('timesheet.byProject.completed')}</th>
                </tr>
              </thead>
              <tbody>
                {progress.phases.map(({ phase, state, doneAt }, i) => {
                  const list = r.mine.filter((e) => e.phaseId === phase.id).sort((a, b) => a.start.localeCompare(b.start));
                  const minutes = list.reduce((s, e) => s + counted(e), 0);
                  const isOpen = openPhase === phase.id;
                  return (
                    <PhaseBlock key={phase.id}>
                      <tr className="border-t border-slate-200 dark:border-slate-800">
                        <td className="py-2 pr-2">
                          <button
                            disabled={!list.length}
                            onClick={() => setOpenPhase(isOpen ? null : phase.id)}
                            aria-expanded={isOpen}
                            className="flex items-center gap-1.5 text-left font-medium text-slate-800 disabled:text-slate-400 dark:text-slate-100"
                          >
                            {list.length ? isOpen ? <ChevronDown className="size-4" /> : <ChevronRight className="size-4" /> : <span className="w-4" />}
                            <span className="text-xs text-slate-400 tabular-nums">{i + 1}.</span>
                            {phase.name}
                            {state === 'done' && <CheckCheck className="size-4 text-green-600" aria-label={t('timesheet.state.done')} />}
                            {state === 'active' && <Badge tone="blue">{t('timesheet.state.active')}</Badge>}
                            {state === 'next' && <Badge tone="slate">{t('timesheet.state.next')}</Badge>}
                          </button>
                        </td>
                        <td className="py-2 pr-2 text-right">
                          <ForecastMeter minutes={minutes} hours={r.p.phaseForecast?.[phase.id]} />
                        </td>
                        <td className="py-2 pr-2">
                          <span className="flex flex-wrap gap-1.5">
                            {byEngineer(list).map(({ id, minutes: m }) => (
                              <span key={id} className="inline-flex items-center gap-1 text-xs">
                                <Avatar name={emp.get(id)?.name ?? '?'} color={emp.get(id)?.color ?? '#64748b'} size="sm" />
                                {emp.get(id)?.name.split(' ')[0]} <span className="text-slate-500 tabular-nums">{formatMinutes(m)}</span>
                              </span>
                            ))}
                          </span>
                        </td>
                        <td className="py-2 pr-2 tabular-nums">{stamp(list[0]?.start)}</td>
                        <td className="py-2 tabular-nums">{stamp(doneAt)}</td>
                      </tr>
                      {isOpen &&
                        list.map((e) => (
                          <tr key={e.id} className={cn('text-xs text-slate-600 dark:text-slate-300', needsReview(e) && 'bg-amber-50 dark:bg-amber-500/10')}>
                            <td className="py-1 pr-2 pl-10">{emp.get(e.employeeId)?.name}</td>
                            <td className="py-1 pr-2 text-right tabular-nums">{needsReview(e) ? '—' : formatMinutes(entryMinutes(e))}</td>
                            <td className="py-1 pr-2 tabular-nums" colSpan={1}>
                              {stamp(e.start)} → {e.end ? timeOf(e.end) : needsReview(e) ? <span className="font-medium text-amber-700 dark:text-amber-400">{t('timesheet.byProject.forgotOut')}</span> : <span className="font-medium text-blue-600">{t('timesheet.inProgress')}</span>}
                            </td>
                            <td className="py-1 pr-2">
                              {e.completesPhase && <Badge tone="green">{t('timesheet.state.done')}</Badge>} {e.source === 'manual' && <Badge tone="violet">{t('timesheet.source.manual')}</Badge>}{' '}
                              {isOffSchedule(e, assignments) && <Badge tone="red">{t('timesheet.offSchedule')}</Badge>}
                            </td>
                            <td className="py-1 text-right">
                              {allowed && (
                                <Button size="sm" variant="ghost" icon={Pencil} onClick={() => onEditEntry(e)} aria-label={t('common.edit')} title={needsReview(e) ? t('timesheet.fix') : t('common.edit')} />
                              )}
                            </td>
                          </tr>
                        ))}
                    </PhaseBlock>
                  );
                })}
              </tbody>
            </table>
          </div>

          <div className="mt-3 flex flex-wrap items-center gap-2 border-t border-slate-200 pt-3 dark:border-slate-800">
            {r.exportable ? (
              <HoursReportButton projectId={p.id} />
            ) : (
              <span className="inline-flex items-center gap-1.5 text-xs text-slate-500">
                <FileSpreadsheet className="size-3.5" /> {t('timesheet.byProject.exportWhenDone')}
              </span>
            )}
            <span className="flex-1" />
            {allowed &&
              r.flag === 'waiting' &&
              r.holders.map((h) => (
                <Button key={h.id} size="sm" variant="ghost" icon={Unlock} className="text-amber-700 dark:text-amber-400" onClick={() => { setUnlocking(h); setNote(''); }}>
                  {t('timesheet.byProject.unlock', { name: h.name.split(' ')[0] ?? h.name })}
                </Button>
              ))}
          </div>
        </div>
      )}

      <Modal
        open={!!unlocking}
        onClose={() => setUnlocking(null)}
        title={unlocking ? t('timesheet.releaseTitle', { name: unlocking.name, project: p.projectNumber }) : ''}
        footer={
          <Button
            variant="primary"
            icon={Unlock}
            onClick={() => {
              timesheetService.release(unlocking!.id, note.trim());
              toast.success(t('timesheet.released'));
              setUnlocking(null);
            }}
          >
            {t('timesheet.byProject.unlockShort')}
          </Button>
        }
      >
        <p className="mb-3 text-sm text-slate-600 dark:text-slate-300">{t('timesheet.releaseText', { name: unlocking?.name ?? '' })}</p>
        <Field label={t('timesheet.releaseNote')}>{(id) => <Input id={id} value={note} onChange={(e) => setNote(e.target.value)} />}</Field>
      </Modal>
    </li>
  );
}

const PhaseBlock = ({ children }: { children: React.ReactNode }) => <>{children}</>;
