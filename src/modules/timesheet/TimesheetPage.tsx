import { useEffect, useMemo, useState } from 'react';
import QRCode from 'qrcode';
import { ArrowDown, ArrowUp, CheckCheck, Clock3, Download, ExternalLink, KeyRound, Pencil, Plus, Printer, QrCode, Timer, Trash2, TriangleAlert, Unlock, Users } from 'lucide-react';
import { useCan } from '@/app/session';
import { Badge } from '@/components/ui/Badge';
import { Button } from '@/components/ui/Button';
import { Drawer } from '@/components/ui/Drawer';
import { Field, Input, Select } from '@/components/ui/Field';
import { ConfirmDialog, Modal } from '@/components/ui/Modal';
import { Avatar, EmptyState, PageHeader, StatCard } from '@/components/ui/misc';
import { useToast } from '@/components/ui/Toast';
import { useCollection } from '@/data/hooks';
import { isProjectActive } from '@/domain/purchasing';
import { canClock, currentJobOf, entryMinutes, jobProgress, type PhaseState, formatHoursDecimal, formatMinutes, localDay, needsReview, timesheetService, validateEntry, type EntryDraft } from '@/domain/timeTracking';
import { useI18n } from '@/i18n';
import { cn } from '@/lib/cn';
import { addDays, startOfWeek, todayISO } from '@/lib/dates';
import { formatDate, getFormatLocale } from '@/lib/format';
import { newId } from '@/lib/id';
import { usePersistentState } from '@/lib/usePersistentState';
import type { TimeEntry, WorkPhase } from '@/types/models';

type Tab = 'now' | 'jobs' | 'entries' | 'team' | 'phases' | 'qr';
const TABS: Tab[] = ['now', 'jobs', 'entries', 'team', 'phases', 'qr'];
const isTab = (v: unknown): v is Tab => TABS.includes(v as Tab);

const timeOf = (iso: string) => new Date(iso).toLocaleTimeString(getFormatLocale(), { hour: '2-digit', minute: '2-digit' });
/** ISO ↔ valor de `<input type="datetime-local">` (horário local). */
const toLocalInput = (iso?: string) => {
  if (!iso) return '';
  const d = new Date(iso);
  const p = (n: number) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}T${p(d.getHours())}:${p(d.getMinutes())}`;
};
const fromLocalInput = (v: string) => (v ? new Date(v).toISOString() : '');

/** Supervisão das horas da oficina: agora, apontamentos, PINs, fases e QR code do ponto. */
export function TimesheetPage() {
  const { t } = useI18n();
  const [tab, setTab] = usePersistentState<Tab>('timesheet.tab', 'now', isTab);
  const entries = useCollection('timeEntries');
  const [, tick] = useState(0);
  useEffect(() => {
    const id = setInterval(() => tick((n) => n + 1), 60_000);
    return () => clearInterval(id);
  }, []);

  const today = todayISO();
  const weekStart = startOfWeek(today);
  const open = entries.filter((e) => !e.end);
  const review = open.filter((e) => needsReview(e));
  const sumMin = (from: string) => entries.filter((e) => localDay(e.start) >= from && localDay(e.start) <= today && !needsReview(e)).reduce((s, e) => s + entryMinutes(e), 0);

  return (
    <>
      <PageHeader icon={Timer} title={t('timesheet.title')} description={t('timesheet.description')} />
      <div className="mb-6 grid grid-cols-2 gap-4 lg:grid-cols-4">
        <StatCard icon={Users} tone="info" label={t('timesheet.kpis.working')} value={open.length - review.length} onClick={() => setTab('now')} />
        <StatCard icon={Clock3} label={t('timesheet.kpis.today')} value={formatHoursDecimal(sumMin(today))} />
        <StatCard icon={Timer} label={t('timesheet.kpis.week')} value={formatHoursDecimal(sumMin(weekStart))} />
        <StatCard icon={TriangleAlert} tone={review.length ? 'warning' : 'default'} label={t('timesheet.kpis.review')} value={review.length} onClick={() => setTab('now')} />
      </div>

      <div className="mb-4 flex gap-1 overflow-x-auto border-b border-slate-200 dark:border-slate-800" role="tablist">
        {TABS.map((x) => (
          <button
            key={x}
            role="tab"
            aria-selected={tab === x}
            onClick={() => setTab(x)}
            className={cn(
              '-mb-px border-b-2 px-4 py-2 text-sm font-medium whitespace-nowrap',
              tab === x ? 'border-brand-500 text-slate-900 dark:text-white' : 'border-transparent text-slate-500 hover:text-slate-800 dark:hover:text-slate-200',
            )}
          >
            {x === 'jobs' ? t('timesheet.jobsTab') : t(`timesheet.tabs.${x}`)}
          </button>
        ))}
      </div>

      {tab === 'now' && <NowTab />}
      {tab === 'jobs' && <JobsTab />}
      {tab === 'entries' && <EntriesTab />}
      {tab === 'team' && <TeamTab />}
      {tab === 'phases' && <PhasesTab />}
      {tab === 'qr' && <QrTab />}
    </>
  );
}

function useLookups() {
  const employees = useCollection('employees');
  const projects = useCollection('projects');
  const phases = useCollection('workPhases');
  return useMemo(
    () => ({
      employees,
      projects,
      phases,
      emp: new Map(employees.map((e) => [e.id, e])),
      prj: new Map(projects.map((p) => [p.id, p])),
      ph: new Map(phases.map((p) => [p.id, p])),
    }),
    [employees, projects, phases],
  );
}

// ───────────── Agora ─────────────

function NowTab() {
  const { t } = useI18n();
  const entries = useCollection('timeEntries');
  const { emp, prj, ph } = useLookups();
  const allowed = useCan()('time.manage');
  const [editing, setEditing] = useState<TimeEntry | null>(null);
  const open = entries.filter((e) => !e.end).sort((a, b) => a.start.localeCompare(b.start));
  const review = open.filter((e) => needsReview(e));
  const live = open.filter((e) => !needsReview(e));

  return (
    <div className="space-y-6">
      {review.length > 0 && (
        <section className="card border-amber-400/60 p-4">
          <h2 className="flex items-center gap-2 font-semibold text-slate-900 dark:text-white">
            <TriangleAlert className="size-5 text-amber-500" /> {t('timesheet.reviewTitle')}
          </h2>
          <p className="mb-3 text-sm text-slate-500">{t('timesheet.reviewHint')}</p>
          <ul className="divide-y divide-slate-100 dark:divide-slate-800">
            {review.map((e) => (
              <li key={e.id} className="flex flex-wrap items-center gap-3 py-2.5">
                <Avatar name={emp.get(e.employeeId)?.name ?? '?'} color={emp.get(e.employeeId)?.color ?? '#64748b'} size="sm" />
                <div className="min-w-0 flex-1 text-sm">
                  <p className="font-medium text-slate-900 dark:text-white">{emp.get(e.employeeId)?.name}</p>
                  <p className="text-slate-500">
                    {ph.get(e.phaseId)?.name} · <span className="font-mono">{prj.get(e.projectId)?.projectNumber}</span> · {formatDate(localDay(e.start))} {timeOf(e.start)}
                  </p>
                </div>
                {allowed && (
                  <Button size="sm" icon={Pencil} onClick={() => setEditing(e)}>
                    {t('timesheet.fix')}
                  </Button>
                )}
              </li>
            ))}
          </ul>
        </section>
      )}

      {live.length === 0 ? (
        <EmptyState icon={Users} title={t('timesheet.nowEmpty')} />
      ) : (
        <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
          {live.map((e) => {
            const p = prj.get(e.projectId);
            const who = emp.get(e.employeeId);
            return (
              <div key={e.id} className="card border-l-4 p-4" style={{ borderLeftColor: p?.color }}>
                <div className="flex items-center gap-3">
                  <span className="relative">
                    <Avatar name={who?.name ?? '?'} color={who?.color ?? '#64748b'} />
                    <span className="absolute -right-0.5 -bottom-0.5 size-3 rounded-full bg-green-500 ring-2 ring-white dark:ring-slate-900" />
                  </span>
                  <div className="min-w-0">
                    <p className="truncate font-semibold text-slate-900 dark:text-white">{who?.name}</p>
                    <p className="truncate text-sm text-slate-600 dark:text-slate-300">{ph.get(e.phaseId)?.name}</p>
                  </div>
                </div>
                <p className="mt-2 truncate text-sm text-slate-500">
                  <span className="font-mono">{p?.projectNumber}</span> · {p?.customer}
                </p>
                <p className="mt-1 text-xs text-slate-500 tabular-nums">
                  {timeOf(e.start)} · {formatMinutes(entryMinutes(e))}
                </p>
              </div>
            );
          })}
        </div>
      )}
      <EntryDrawer entry={editing} onClose={() => setEditing(null)} />
    </div>
  );
}

// ───────────── Apontamentos ─────────────

function EntriesTab() {
  const { t } = useI18n();
  const entries = useCollection('timeEntries');
  const { employees, projects, emp, prj, ph } = useLookups();
  const allowed = useCan()('time.manage');
  const today = todayISO();
  const [from, setFrom] = useState(addDays(startOfWeek(today), -7));
  const [to, setTo] = useState(today);
  const [employeeId, setEmployeeId] = useState('');
  const [projectId, setProjectId] = useState('');
  const [editing, setEditing] = useState<TimeEntry | 'new' | null>(null);

  const rows = entries
    .filter((e) => localDay(e.start) >= from && localDay(e.start) <= to && (!employeeId || e.employeeId === employeeId) && (!projectId || e.projectId === projectId))
    .sort((a, b) => b.start.localeCompare(a.start));
  const total = rows.reduce((s, e) => s + entryMinutes(e), 0);

  // Horas por fase no filtro (útil por projeto).
  const byPhase = new Map<string, number>();
  for (const e of rows) byPhase.set(e.phaseId, (byPhase.get(e.phaseId) ?? 0) + entryMinutes(e));

  return (
    <div className="space-y-4">
      <div className="card flex flex-wrap items-end gap-3 p-3">
        <Field label={t('timesheet.filters.from')}>{(id) => <Input id={id} type="date" value={from} onChange={(e) => setFrom(e.target.value)} className="w-40" />}</Field>
        <Field label={t('timesheet.filters.to')}>{(id) => <Input id={id} type="date" value={to} onChange={(e) => setTo(e.target.value)} className="w-40" />}</Field>
        <Field label={t('timesheet.filters.employee')}>
          {(id) => <Select id={id} value={employeeId} onChange={setEmployeeId} options={[{ value: '', label: t('timesheet.filters.all') }, ...employees.map((e) => ({ value: e.id, label: e.name }))]} />}
        </Field>
        <Field label={t('timesheet.filters.project')}>
          {(id) => (
            <Select id={id} value={projectId} onChange={setProjectId} options={[{ value: '', label: t('timesheet.filters.all') }, ...projects.map((p) => ({ value: p.id, label: `${p.projectNumber} · ${p.customer}` }))]} />
          )}
        </Field>
        <div className="ml-auto">
          {allowed && (
            <Button variant="primary" icon={Plus} onClick={() => setEditing('new')}>
              {t('timesheet.add')}
            </Button>
          )}
        </div>
      </div>

      {byPhase.size > 0 && (
        <div className="card flex flex-wrap items-center gap-2 p-3 text-sm">
          <span className="mr-1 font-semibold text-slate-700 dark:text-slate-200">{t('timesheet.hoursByPhase')}:</span>
          {[...byPhase.entries()]
            .sort((a, b) => (ph.get(a[0])?.order ?? 99) - (ph.get(b[0])?.order ?? 99))
            .map(([id, min]) => (
              <Badge key={id} tone="slate">
                {ph.get(id)?.name ?? '—'} · {formatMinutes(min)}
              </Badge>
            ))}
          <span className="ml-auto font-semibold tabular-nums">
            {t('timesheet.total')}: {formatMinutes(total)}
          </span>
        </div>
      )}

      {rows.length === 0 ? (
        <EmptyState icon={Clock3} title={t('timesheet.empty')} />
      ) : (
        <div className="card overflow-x-auto">
          <table className="w-full min-w-[760px] text-sm">
            <thead className="bg-slate-50 dark:bg-slate-800/50">
              <tr>
                <th className="th">{t('timesheet.cols.employee')}</th>
                <th className="th">{t('timesheet.cols.project')}</th>
                <th className="th">{t('timesheet.cols.phase')}</th>
                <th className="th">{t('timesheet.cols.start')}</th>
                <th className="th">{t('timesheet.cols.end')}</th>
                <th className="th text-right">{t('timesheet.cols.duration')}</th>
                <th className="th">{t('timesheet.cols.source')}</th>
                <th className="th" />
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100 dark:divide-slate-800">
              {rows.map((e) => {
                const rv = needsReview(e);
                return (
                  <tr key={e.id} className={cn(rv && 'bg-amber-50/60 dark:bg-amber-500/5')}>
                    <td className="td font-medium">{emp.get(e.employeeId)?.name}</td>
                    <td className="td">
                      <span className="font-mono text-xs">{prj.get(e.projectId)?.projectNumber}</span> <span className="text-slate-500">{prj.get(e.projectId)?.customer}</span>
                    </td>
                    <td className="td">
                      {ph.get(e.phaseId)?.name}
                      {e.completesPhase && <CheckCheck className="ml-1 inline size-4 text-green-600" aria-label={t('timesheet.state.done')} />}
                      {e.released && <span className="ml-1 text-xs text-amber-600">({t('timesheet.releasedTag')})</span>}
                    </td>
                    <td className="td tabular-nums">
                      {formatDate(localDay(e.start))} {timeOf(e.start)}
                    </td>
                    <td className="td tabular-nums">
                      {e.end ? (
                        <>
                          {localDay(e.end) !== localDay(e.start) && `${formatDate(localDay(e.end))} `}
                          {timeOf(e.end)}
                          {e.autoClosed && <span className="ml-1 text-xs text-slate-400" title={t('timesheet.autoClosed')}>↻</span>}
                        </>
                      ) : (
                        <Badge tone={rv ? 'amber' : 'green'} dot>
                          {rv ? t('timesheet.kpis.review') : t('timesheet.inProgress')}
                        </Badge>
                      )}
                    </td>
                    <td className="td text-right font-medium tabular-nums">{rv ? '—' : formatMinutes(entryMinutes(e))}</td>
                    <td className="td">
                      <Badge tone={e.source === 'qr' ? 'cyan' : 'violet'}>{t(`timesheet.source.${e.source}`)}</Badge>
                    </td>
                    <td className="td text-right">
                      {allowed && (
                        <Button size="sm" variant="ghost" icon={Pencil} aria-label={t('timesheet.edit')} onClick={() => setEditing(e)} />
                      )}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
      <EntryDrawer entry={editing === 'new' ? null : editing} isNew={editing === 'new'} onClose={() => setEditing(null)} />
    </div>
  );
}

function EntryDrawer({ entry, isNew, onClose }: { entry: TimeEntry | null; isNew?: boolean; onClose: () => void }) {
  const { t } = useI18n();
  const toast = useToast();
  const { employees, projects, phases } = useLookups();
  const open = isNew || !!entry;
  const blank: EntryDraft = { employeeId: '', projectId: '', phaseId: '', start: '', end: '', note: '', completesPhase: false };
  const [d, setD] = useState<EntryDraft>(blank);
  const [error, setError] = useState('');
  const [confirm, setConfirm] = useState(false);
  useEffect(() => {
    if (open) {
      setD(entry ? { employeeId: entry.employeeId, projectId: entry.projectId, phaseId: entry.phaseId, start: entry.start, end: entry.end ?? '', note: entry.note, completesPhase: !!entry.completesPhase } : blank);
      setError('');
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, entry]);

  const save = (ev: React.FormEvent) => {
    ev.preventDefault();
    const draft = { ...d, end: d.end || undefined };
    const err = validateEntry(draft);
    if (err) return setError(t(err));
    timesheetService.save(draft, entry?.id);
    toast.success(t('timesheet.saved'));
    onClose();
  };

  const set = <K extends keyof EntryDraft>(k: K, v: EntryDraft[K]) => setD((x) => ({ ...x, [k]: v }));
  return (
    <Drawer
      open={open}
      onClose={onClose}
      title={isNew ? t('timesheet.new') : t('timesheet.edit')}
      footer={
        <div className="flex w-full items-center gap-2">
          {entry && (
            <Button variant="ghost" icon={Trash2} onClick={() => setConfirm(true)} className="text-red-600">
              {t('timesheet.delete')}
            </Button>
          )}
          <Button type="submit" form="entry-form" variant="primary" className="ml-auto">
            {t('common.save')}
          </Button>
        </div>
      }
    >
      <form id="entry-form" onSubmit={save} className="space-y-4">
        <Field label={t('timesheet.cols.employee')} required>
          {(id) => <Select id={id} value={d.employeeId} onChange={(v) => set('employeeId', v)} options={[{ value: '', label: '—' }, ...employees.map((e) => ({ value: e.id, label: e.name }))]} />}
        </Field>
        <Field label={t('timesheet.cols.project')} required>
          {(id) => (
            <Select
              id={id}
              value={d.projectId}
              onChange={(v) => set('projectId', v)}
              options={[{ value: '', label: '—' }, ...projects.filter((p) => isProjectActive(p) || p.id === d.projectId).map((p) => ({ value: p.id, label: `${p.projectNumber} · ${p.customer}` }))]}
            />
          )}
        </Field>
        <Field label={t('timesheet.cols.phase')} required>
          {(id) => <Select id={id} value={d.phaseId} onChange={(v) => set('phaseId', v)} options={[{ value: '', label: '—' }, ...phases.map((p) => ({ value: p.id, label: p.name }))]} />}
        </Field>
        <div className="grid gap-4 sm:grid-cols-2">
          <Field label={t('timesheet.cols.start')} required>
            {(id) => <Input id={id} type="datetime-local" value={toLocalInput(d.start)} onChange={(e) => set('start', fromLocalInput(e.target.value))} />}
          </Field>
          <Field label={t('timesheet.cols.end')}>
            {(id) => <Input id={id} type="datetime-local" value={toLocalInput(d.end)} onChange={(e) => set('end', fromLocalInput(e.target.value))} />}
          </Field>
        </div>
        <label className="flex items-center gap-2 text-sm text-slate-700 dark:text-slate-200">
          <input type="checkbox" checked={!!d.completesPhase} disabled={!d.end} onChange={(e) => set('completesPhase', e.target.checked)} className="size-4 accent-amber-500" />
          {t('timesheet.phaseDone')}
        </label>
        <Field label={t('timesheet.note')}>{(id) => <Input id={id} value={d.note} onChange={(e) => set('note', e.target.value)} />}</Field>
        {error && (
          <p role="alert" className="text-sm text-red-600">
            {error}
          </p>
        )}
      </form>
      <ConfirmDialog
        open={confirm}
        title={t('timesheet.delete')}
        message={t('timesheet.deleteConfirm')}
        onCancel={() => setConfirm(false)}
        onConfirm={() => {
          if (entry) timesheetService.remove(entry.id);
          setConfirm(false);
          toast.success(t('timesheet.deleted'));
          onClose();
        }}
      />
    </Drawer>
  );
}

// ───────────── Serviços (progresso pelas fases) ─────────────

const STATE_STYLE: Record<PhaseState, string> = {
  done: 'bg-green-500 text-white border-green-500',
  active: 'bg-blue-600 text-white border-blue-600',
  next: 'border-blue-600 text-blue-700 dark:text-blue-300',
  pending: 'border-slate-300 text-slate-400 dark:border-slate-600',
};

function JobsTab() {
  const { t } = useI18n();
  const toast = useToast();
  const entries = useCollection('timeEntries');
  const { employees, projects, phases, emp } = useLookups();
  const allowed = useCan()('time.manage');
  const [filter, setFilter] = useState<'open' | 'complete'>('open');
  const [releasing, setReleasing] = useState<{ employeeId: string; projectId: string } | null>(null);
  const [note, setNote] = useState('');
  const prjById = useMemo(() => new Map(projects.map((p) => [p.id, p])), [projects]);

  const jobs = projects
    .filter((p) => entries.some((e) => e.projectId === p.id))
    .map((p) => ({ p, prog: jobProgress(p.id, phases, entries), holders: employees.filter((e) => currentJobOf(e.id, entries, phases, prjById) === p.id) }))
    .filter(({ prog, p }) => (filter === 'complete' ? prog.complete : !prog.complete && isProjectActive(p)))
    .sort((a, b) => a.p.projectNumber.localeCompare(b.p.projectNumber));

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <p className="max-w-3xl text-sm text-slate-500">{t('timesheet.jobsHint')}</p>
        <div className="flex gap-1 rounded-lg bg-slate-100 p-1 dark:bg-slate-800">
          {(['open', 'complete'] as const).map((f) => (
            <button
              key={f}
              onClick={() => setFilter(f)}
              aria-pressed={filter === f}
              className={cn('rounded-md px-3 py-1.5 text-sm font-medium', filter === f ? 'bg-white text-slate-900 shadow-sm dark:bg-slate-700 dark:text-white' : 'text-slate-500')}
            >
              {t(`timesheet.jobsFilter.${f}`)}
            </button>
          ))}
        </div>
      </div>
      {jobs.length === 0 ? (
        <EmptyState icon={Timer} title={t('timesheet.jobsEmpty')} />
      ) : (
        <div className="grid gap-3 xl:grid-cols-2">
          {jobs.map(({ p, prog, holders }) => (
            <div key={p.id} className="card border-l-4 p-4" style={{ borderLeftColor: p.color }}>
              <div className="flex flex-wrap items-start justify-between gap-2">
                <div className="min-w-0">
                  <p className="font-mono text-xs text-slate-500">{p.projectNumber}</p>
                  <p className="truncate font-semibold text-slate-900 dark:text-white">{p.customer}</p>
                </div>
                <Badge tone={prog.complete ? 'green' : 'blue'}>{t('projects.phasesProgress', { done: prog.done, total: prog.total })}</Badge>
              </div>
              <ol className="mt-3 flex flex-wrap gap-1.5">
                {prog.phases.map(({ phase, state, minutes }, i) => (
                  <li key={phase.id} title={`${t(`timesheet.state.${state}`)} · ${formatMinutes(minutes)}`} className={cn('flex items-center gap-1 rounded-full border-2 px-2 py-0.5 text-xs font-medium', STATE_STYLE[state])}>
                    {state === 'done' ? <CheckCheck className="size-3" /> : <span className="tabular-nums">{i + 1}</span>}
                    {phase.name}
                    {minutes > 0 && <span className="opacity-80 tabular-nums">· {formatMinutes(minutes)}</span>}
                  </li>
                ))}
              </ol>
              <div className="mt-3 flex flex-wrap items-center gap-2 text-sm">
                <span className="text-slate-500">{t('timesheet.holders')}:</span>
                {holders.length === 0 && <span className="text-slate-400">{t('timesheet.noHolder')}</span>}
                {holders.map((h) => (
                  <span key={h.id} className="inline-flex items-center gap-1.5 rounded-full bg-slate-100 py-0.5 pr-1 pl-0.5 dark:bg-slate-800">
                    <Avatar name={h.name} color={h.color} size="sm" />
                    <span className="text-slate-700 dark:text-slate-200">{h.name}</span>
                    {allowed && (
                      <button
                        onClick={() => {
                          setReleasing({ employeeId: h.id, projectId: p.id });
                          setNote('');
                        }}
                        className="rounded-full px-1.5 text-xs font-medium text-amber-700 hover:bg-amber-100 dark:text-amber-400 dark:hover:bg-amber-500/15"
                      >
                        <Unlock className="mr-0.5 inline size-3" />
                        {t('timesheet.release')}
                      </button>
                    )}
                  </span>
                ))}
              </div>
            </div>
          ))}
        </div>
      )}
      <Modal
        open={!!releasing}
        onClose={() => setReleasing(null)}
        title={releasing ? t('timesheet.releaseTitle', { name: emp.get(releasing.employeeId)?.name ?? '', project: prjById.get(releasing.projectId)?.projectNumber ?? '' }) : ''}
        footer={
          <Button
            variant="primary"
            icon={Unlock}
            onClick={() => {
              timesheetService.release(releasing!.employeeId, note.trim());
              toast.success(t('timesheet.released'));
              setReleasing(null);
            }}
          >
            {t('timesheet.release')}
          </Button>
        }
      >
        <p className="mb-3 text-sm text-slate-600 dark:text-slate-300">{t('timesheet.releaseText', { name: releasing ? (emp.get(releasing.employeeId)?.name ?? '') : '' })}</p>
        <Field label={t('timesheet.releaseNote')}>{(id) => <Input id={id} value={note} onChange={(e) => setNote(e.target.value)} />}</Field>
      </Modal>
    </div>
  );
}

// ───────────── Equipe & PINs ─────────────

function TeamTab() {
  const { t } = useI18n();
  const toast = useToast();
  const employees = useCollection('employees');
  const allowed = useCan()('time.manage');
  const [editing, setEditing] = useState<{ id: string; name: string } | null>(null);
  const [pin, setPin] = useState('');
  const [error, setError] = useState('');

  const savePin = () => {
    if (!/^\d{4,6}$/.test(pin)) return setError(t('timesheet.pinInvalid'));
    timesheetService.setClockPin(editing!.id, pin);
    toast.success(t('timesheet.pinSaved'));
    setEditing(null);
  };

  return (
    <>
      <p className="mb-3 text-sm text-slate-500">{t('timesheet.teamHint')}</p>
      {!allowed && <p className="mb-3 text-sm text-slate-500">{t('timesheet.readOnly')}</p>}
      <div className="card divide-y divide-slate-100 dark:divide-slate-800">
        {employees.map((e) => (
          <div key={e.id} className="flex flex-wrap items-center gap-3 px-4 py-3">
            <Avatar name={e.name} color={e.color} muted={e.status !== 'active'} />
            <div className="min-w-0 flex-1">
              <p className="font-medium text-slate-900 dark:text-white">{e.name}</p>
              <p className="text-xs text-slate-500">{e.role}</p>
            </div>
            <Badge tone={canClock(e) ? 'green' : 'slate'} dot>
              {e.clockPinHash ? t('timesheet.pinSet') : t('timesheet.pinMissing')}
            </Badge>
            {allowed && (
              <div className="flex gap-1">
                <Button
                  size="sm"
                  icon={KeyRound}
                  onClick={() => {
                    setEditing({ id: e.id, name: e.name });
                    setPin('');
                    setError('');
                  }}
                >
                  {e.clockPinHash ? t('timesheet.changePin') : t('timesheet.setPin')}
                </Button>
                {e.clockPinHash && (
                  <Button
                    size="sm"
                    variant="ghost"
                    icon={Trash2}
                    aria-label={t('timesheet.removePin')}
                    onClick={() => {
                      timesheetService.setClockPin(e.id, null);
                      toast.success(t('timesheet.pinRemoved'));
                    }}
                  />
                )}
              </div>
            )}
          </div>
        ))}
      </div>
      <Modal
        open={!!editing}
        onClose={() => setEditing(null)}
        title={editing ? (editing.name) : ''}
        footer={
          <Button variant="primary" onClick={savePin}>
            {t('common.save')}
          </Button>
        }
      >
        <Field label={t('timesheet.pinLabel', { name: editing?.name ?? '' })} error={error}>
          {(id) => (
            <Input
              id={id}
              inputMode="numeric"
              autoComplete="off"
              maxLength={6}
              value={pin}
              onChange={(e) => {
                setPin(e.target.value.replace(/\D/g, ''));
                setError('');
              }}
              onKeyDown={(e) => e.key === 'Enter' && savePin()}
              className="font-mono text-lg tracking-[0.4em]"
            />
          )}
        </Field>
      </Modal>
    </>
  );
}

// ───────────── Fases ─────────────

function PhasesTab() {
  const { t } = useI18n();
  const toast = useToast();
  const phases = useCollection('workPhases');
  const allowed = useCan()('time.manage');
  const [list, setList] = useState<WorkPhase[]>([]);
  const [error, setError] = useState('');
  useEffect(() => setList([...phases].sort((a, b) => a.order - b.order)), [phases]);

  const move = (i: number, dir: -1 | 1) =>
    setList((l) => {
      const next = [...l];
      const j = i + dir;
      if (j < 0 || j >= next.length) return l;
      [next[i], next[j]] = [next[j]!, next[i]!];
      return next;
    });
  const save = () => {
    if (list.some((p) => !p.name.trim())) return setError(t('timesheet.phaseEmpty'));
    timesheetService.savePhases(list.map((p) => ({ ...p, name: p.name.trim() })));
    setError('');
    toast.success(t('timesheet.phasesSaved'));
  };

  return (
    <div className="max-w-2xl">
      <p className="mb-3 text-sm text-slate-500">{t('timesheet.phasesHint')}</p>
      <fieldset disabled={!allowed} className="card divide-y divide-slate-100 dark:divide-slate-800">
        {list.map((p, i) => (
          <div key={p.id} className="flex items-center gap-2 px-3 py-2">
            <span className="w-6 text-right text-xs text-slate-400 tabular-nums">{i + 1}</span>
            <Input value={p.name} aria-label={t('timesheet.phaseName')} onChange={(e) => setList((l) => l.map((x) => (x.id === p.id ? { ...x, name: e.target.value } : x)))} className="flex-1" />
            <label className="flex items-center gap-1.5 text-sm text-slate-600 dark:text-slate-300">
              <input type="checkbox" checked={p.active} onChange={(e) => setList((l) => l.map((x) => (x.id === p.id ? { ...x, active: e.target.checked } : x)))} className="size-4 accent-amber-500" />
              {t('timesheet.active')}
            </label>
            <Button size="sm" variant="ghost" icon={ArrowUp} aria-label={t('timesheet.moveUp')} onClick={() => move(i, -1)} disabled={i === 0} />
            <Button size="sm" variant="ghost" icon={ArrowDown} aria-label={t('timesheet.moveDown')} onClick={() => move(i, 1)} disabled={i === list.length - 1} />
          </div>
        ))}
      </fieldset>
      {allowed && (
        <div className="mt-3 flex items-center gap-2">
          <Button icon={Plus} onClick={() => setList((l) => [...l, { id: newId('ph'), name: '', order: l.length + 1, active: true }])}>
            {t('timesheet.addPhase')}
          </Button>
          <Button variant="primary" onClick={save} className="ml-auto">
            {t('common.save')}
          </Button>
        </div>
      )}
      {error && (
        <p role="alert" className="mt-2 text-sm text-red-600">
          {error}
        </p>
      )}
    </div>
  );
}

// ───────────── QR code ─────────────

/** Endereço do ponto: mesmo site, rota `#/clock`. */
export const clockUrl = () => `${window.location.origin}${window.location.pathname}#/clock`;

function QrTab() {
  const { t } = useI18n();
  const [svg, setSvg] = useState('');
  const [png, setPng] = useState('');
  const url = clockUrl();
  useEffect(() => {
    void QRCode.toString(url, { type: 'svg', margin: 1, errorCorrectionLevel: 'M' }).then(setSvg);
    void QRCode.toDataURL(url, { margin: 2, width: 1024, errorCorrectionLevel: 'M' }).then(setPng);
  }, [url]);

  const print = () => {
    const w = window.open('', '_blank');
    if (!w) return;
    w.document.write(`<!doctype html><html><head><meta charset="utf-8"><title>${t('timesheet.posterTitle')}</title>
<style>body{font-family:system-ui,sans-serif;text-align:center;padding:40px;color:#0f172a}h1{font-size:40px;margin:0 0 8px}p{font-size:20px;max-width:560px;margin:0 auto 24px}
.qr{width:440px;height:440px;margin:0 auto}.qr svg{width:100%;height:100%}small{display:block;margin-top:16px;color:#475569;font-size:14px;word-break:break-all}</style></head>
<body><h1>${t('timesheet.posterTitle')}</h1><p>${t('timesheet.posterText')}</p><div class="qr">${svg}</div><small>${url}</small>
<script>window.onload=()=>{window.print()}</script></body></html>`);
    w.document.close();
  };

  return (
    <div className="card flex flex-col items-center gap-4 p-6 text-center md:flex-row md:items-start md:text-left">
      <div className="size-56 shrink-0 rounded-xl bg-white p-3 shadow-inner [&_svg]:size-full" aria-label={t('timesheet.qrTitle')} role="img" dangerouslySetInnerHTML={{ __html: svg }} />
      <div className="min-w-0">
        <h2 className="flex items-center justify-center gap-2 text-lg font-semibold text-slate-900 md:justify-start dark:text-white">
          <QrCode className="size-5" /> {t('timesheet.qrTitle')}
        </h2>
        <p className="mt-1 text-sm text-slate-500">{t('timesheet.qrHint')}</p>
        <p className="mt-2 font-mono text-sm break-all text-slate-700 dark:text-slate-200">{url}</p>
        <div className="mt-4 flex flex-wrap justify-center gap-2 md:justify-start">
          <Button variant="primary" icon={Printer} onClick={print} disabled={!svg}>
            {t('timesheet.print')}
          </Button>
          <a href={png} download="ponto-oficina-qr.png" className={cn(!png && 'pointer-events-none opacity-50')}>
            <Button icon={Download} tabIndex={-1}>
              {t('timesheet.download')}
            </Button>
          </a>
          <a href="#/clock" target="_blank" rel="noreferrer">
            <Button icon={ExternalLink} tabIndex={-1}>
              {t('timesheet.openClock')}
            </Button>
          </a>
        </div>
      </div>
    </div>
  );
}
