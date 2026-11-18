import { useEffect, useMemo, useState } from 'react';
import { ArrowDown, ArrowUp, CheckCheck, Clock3, Hourglass, KeyRound, Pencil, Plus, Settings2, Timer, Trash2, TriangleAlert, Users } from 'lucide-react';
import { useCan } from '@/app/session';
import { Badge } from '@/components/ui/Badge';
import { Button } from '@/components/ui/Button';
import { Drawer } from '@/components/ui/Drawer';
import { Field, Input, Select } from '@/components/ui/Field';
import { ConfirmDialog, Modal } from '@/components/ui/Modal';
import { QrPoster } from '@/components/ui/QrPoster';
import { TypeToConfirm } from '@/components/ui/TypeToConfirm';
import { Avatar, EmptyState, PageHeader, StatCard } from '@/components/ui/misc';
import { useToast } from '@/components/ui/Toast';
import { useCollection } from '@/data/hooks';
import { isProjectActive } from '@/domain/purchasing';
import { canClock, entryMinutes, jobFlag, workerStatus, formatHoursDecimal, formatMinutes, localDay, needsReview, timesheetService, validateEntry, type EntryDraft, isOffSchedule, entryOverlap } from '@/domain/timeTracking';
import { useI18n } from '@/i18n';
import { cn } from '@/lib/cn';
import { addDays, startOfWeek, todayISO } from '@/lib/dates';
import { formatDate, getFormatLocale } from '@/lib/format';
import { newId } from '@/lib/id';
import { usePersistentState } from '@/lib/usePersistentState';
import { ExportHoursActions } from './HoursReportButton';
import { ByProjectTab, isProjectFilter, type ProjectFilter } from './ByProjectTab';
import { FlowFlag } from './Flags';
import type { TimeEntry, WorkPhase } from '@/types/models';

/**
 * 3 abas por pergunta: **By project** (padrão — o engenheiro muda, o projeto fica), **Live** (agora + o que corrigir),
 * **Timesheet** (horas por pessoa). Ajustes (equipe & PINs, fases, QR code) ficam no botão Settings.
 */
type Tab = 'projects' | 'live' | 'entries';
const TABS: Tab[] = ['projects', 'live', 'entries'];
const isTab = (v: unknown): v is Tab => TABS.includes(v as Tab);
type SettingsTab = 'team' | 'phases' | 'qr';
const SETTINGS_TABS: SettingsTab[] = ['team', 'phases', 'qr'];

const timeOf = (iso: string) => new Date(iso).toLocaleTimeString(getFormatLocale(), { hour: '2-digit', minute: '2-digit' });
/** ISO ↔ valor de `<input type="datetime-local">` (horário local). */
const toLocalInput = (iso?: string) => {
  if (!iso) return '';
  const d = new Date(iso);
  const p = (n: number) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}T${p(d.getHours())}:${p(d.getMinutes())}`;
};
const fromLocalInput = (v: string) => (v ? new Date(v).toISOString() : '');

/** Horas da oficina (supervisão). */
export function TimesheetPage() {
  const { t } = useI18n();
  const [tab, setTab] = usePersistentState<Tab>('timesheet.tab.v2', 'projects', isTab);
  const [projectFilter, setProjectFilter] = usePersistentState<ProjectFilter>('timesheet.projectFilter', 'active', isProjectFilter);
  const [settings, setSettings] = useState<SettingsTab | null>(null);
  const [editing, setEditing] = useState<TimeEntry | null>(null);
  const entries = useCollection('timeEntries');
  const projects = useCollection('projects');
  const workPhases = useCollection('workPhases');
  const waitingJobs = projects.filter((p) => isProjectActive(p) && jobFlag(p.id, workPhases, entries).flag === 'waiting').length;
  const [, tick] = useState(0);
  useEffect(() => {
    const id = setInterval(() => tick((n) => n + 1), 60_000);
    return () => clearInterval(id);
  }, []);

  const today = todayISO();
  const weekStart = startOfWeek(today);
  const open = entries.filter((e) => !e.end);
  const review = open.filter((e) => needsReview(e));
  const weekMin = entries.filter((e) => localDay(e.start) >= weekStart && localDay(e.start) <= today && !needsReview(e)).reduce((s, e) => s + entryMinutes(e), 0);

  return (
    <>
      <PageHeader
        icon={Timer}
        title={t('timesheet.title')}
        description={t('timesheet.descriptionV2')}
        actions={
          <Button icon={Settings2} onClick={() => setSettings('team')}>
            {t('timesheet.settings')}
          </Button>
        }
      />
      <div className="mb-6 grid grid-cols-2 gap-4 lg:grid-cols-4">
        <StatCard icon={Users} tone="info" label={t('timesheet.kpis.working')} value={open.length - review.length} onClick={() => setTab('live')} />
        <StatCard
          icon={Hourglass}
          tone={waitingJobs ? 'warning' : 'default'}
          label={t('timesheet.kpis.waitingSomeone')}
          value={waitingJobs}
          hint={t('timesheet.kpis.waitingSomeoneHint')}
          onClick={() => {
            setProjectFilter('waiting');
            setTab('projects');
          }}
        />
        <StatCard icon={Clock3} label={t('timesheet.kpis.week')} value={formatHoursDecimal(weekMin)} />
        <StatCard icon={TriangleAlert} tone={review.length ? 'warning' : 'default'} label={t('timesheet.kpis.toFix')} value={review.length} hint={t('timesheet.kpis.toFixHint')} onClick={() => setTab('live')} />
      </div>

      <div className="mb-4 flex gap-1 overflow-x-auto border-b border-slate-200 dark:border-slate-800" role="tablist">
        {TABS.map((x) => (
          <button
            key={x}
            role="tab"
            aria-selected={tab === x}
            onClick={() => setTab(x)}
            className={cn(
              '-mb-px flex items-center gap-1.5 border-b-2 px-4 py-2 text-sm font-medium whitespace-nowrap',
              tab === x ? 'border-brand-500 text-slate-900 dark:text-white' : 'border-transparent text-slate-500 hover:text-slate-800 dark:hover:text-slate-200',
            )}
          >
            {t(`timesheet.tabsV2.${x}`)}
            {x === 'live' && review.length > 0 && <span className="rounded-full bg-amber-400 px-1.5 text-[11px] font-bold text-amber-950 tabular-nums">{review.length}</span>}
          </button>
        ))}
      </div>
      <p className="-mt-2 mb-4 text-sm text-slate-500">{t(`timesheet.tabsHint.${tab}`)}</p>

      {tab === 'projects' && <ByProjectTab filter={projectFilter} setFilter={setProjectFilter} onEditEntry={setEditing} actions={<ExportHoursActions only="projects" />} />}
      {tab === 'live' && <NowTab />}
      {tab === 'entries' && (
        <>
          <div className="mb-3 flex justify-end">
            <ExportHoursActions only="employees" />
          </div>
          <EntriesTab />
        </>
      )}
      <EntryDrawer entry={editing} onClose={() => setEditing(null)} />

      <Drawer open={!!settings} onClose={() => setSettings(null)} title={t('timesheet.settings')} subtitle={t('timesheet.settingsHint')} width="lg">
        <div className="mb-4 flex gap-1 border-b border-slate-200 dark:border-slate-800" role="tablist">
          {SETTINGS_TABS.map((x) => (
            <button
              key={x}
              role="tab"
              aria-selected={settings === x}
              onClick={() => setSettings(x)}
              className={cn('-mb-px border-b-2 px-3 py-2 text-sm font-medium', settings === x ? 'border-brand-500 text-slate-900 dark:text-white' : 'border-transparent text-slate-500')}
            >
              {t(`timesheet.tabs.${x}`)}
            </button>
          ))}
        </div>
        {settings === 'team' && <TeamTab />}
        {settings === 'phases' && <PhasesTab />}
        {settings === 'qr' && <QrTab />}
      </Drawer>
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
  const { prj, ph } = useLookups();
  const allowed = useCan()('time.manage');
  const [editing, setEditing] = useState<TimeEntry | null>(null);
  const { employees, projects, phases } = useLookups();
  const prjById = useMemo(() => new Map(projects.map((p) => [p.id, p])), [projects]);
  // Técnicos com PIN do ponto (ou com apontamentos): status de cada um, ordenado por em andamento → aguardando → pronto → livre.
  const order = { working: 0, waiting: 1, ready: 2, idle: 3 } as const;
  const team = employees
    .filter((e) => e.status === 'active' && (e.clockPinHash || entries.some((x) => x.employeeId === e.id)))
    .map((e) => ({ e, st: workerStatus(e.id, entries, phases, prjById) }))
    .sort((a, b) => order[a.st.flag] - order[b.st.flag] || a.e.name.localeCompare(b.e.name));

  return (
    <div className="space-y-6">
      <section>
        <h2 className="font-semibold text-slate-900 dark:text-white">{t('timesheet.flow.teamTitle')}</h2>
        <p className="mb-3 text-sm text-slate-500">{t('timesheet.flow.teamHint')}</p>
        <div className="card divide-y divide-slate-100 overflow-hidden dark:divide-slate-800">
          {team.map(({ e, st }) => {
            const p = st.projectId ? prj.get(st.projectId) : undefined;
            // Esqueceu de bater a saída: não é "em andamento" — é para corrigir.
            const forgot = st.flag === 'working' && !!st.open && needsReview(st.open);
            const last = st.progress?.phases[st.progress.phases.length - 1];
            return (
              <div
                key={e.id}
                className={cn(
                  'flex flex-wrap items-center gap-3 px-4 py-3',
                  st.flag === 'ready' && 'bg-green-50 dark:bg-green-500/10',
                  (st.flag === 'waiting' || forgot) && 'bg-amber-50/70 dark:bg-amber-500/10',
                )}
              >
                <span className="relative">
                  <Avatar name={e.name} color={e.color} />
                  {st.flag === 'working' && !forgot && <span className="absolute -right-0.5 -bottom-0.5 size-3 rounded-full bg-blue-600 ring-2 ring-white dark:ring-slate-900" />}
                  {st.flag === 'ready' && <CheckCheck className="absolute -right-1 -bottom-1 size-4 rounded-full bg-green-600 p-0.5 text-white ring-2 ring-white dark:ring-slate-900" />}
                </span>
                <div className="min-w-[10rem] flex-1">
                  <p className="font-semibold text-slate-900 dark:text-white">{e.name}</p>
                  {p ? (
                    <p className="truncate text-sm text-slate-500">
                      <span className="font-mono">{p.projectNumber}</span> · {p.customer}
                    </p>
                  ) : (
                    <p className="text-sm text-slate-400">{e.role}</p>
                  )}
                </div>
                <div className="min-w-[12rem] text-sm text-slate-600 dark:text-slate-300">
                  {forgot && st.open && (
                    <>
                      <p className="font-medium text-amber-700 dark:text-amber-400">{t('timesheet.byProject.forgotOut')}</p>
                      <p className="text-xs tabular-nums">{ph.get(st.open.phaseId)?.name} · {formatDate(localDay(st.open.start))} {timeOf(st.open.start)}</p>
                    </>
                  )}
                  {!forgot && st.flag === 'working' && st.open && (
                    <>
                      <p className="font-medium text-slate-900 dark:text-white">
                        {last && last.phase.id === st.open.phaseId ? t('timesheet.flow.lastPhase', { phase: last.phase.name }) : ph.get(st.open.phaseId)?.name}
                      </p>
                      <p className="text-xs tabular-nums">{t('clock.since', { time: timeOf(st.open.start), duration: formatMinutes(entryMinutes(st.open)) })}</p>
                    </>
                  )}
                  {st.flag === 'waiting' && st.progress?.next && <p className="font-medium">{t('timesheet.flow.nextPhase', { phase: st.progress.next.name })}</p>}
                  {st.flag === 'ready' && st.readyAt && p && <p className="font-medium text-green-800 dark:text-green-300">{t('timesheet.flow.readyDetail', { project: p.projectNumber, date: formatDate(localDay(st.readyAt)) })}</p>}
                  {st.progress && st.flag !== 'ready' && <p className="text-xs text-slate-500">{t('projects.phasesProgress', { done: st.progress.done, total: st.progress.total })}</p>}
                </div>
                {forgot ? (
                  allowed && (
                    <Button size="sm" icon={Pencil} onClick={() => setEditing(st.open!)}>
                      {t('timesheet.fix')}
                    </Button>
                  )
                ) : (
                  <FlowFlag flag={st.flag} next={st.flag === 'waiting' ? st.progress?.next?.name : undefined} />
                )}
              </div>
            );
          })}
          {team.length === 0 && <EmptyState icon={Users} title={t('timesheet.nowEmpty')} />}
        </div>
      </section>
      <EntryDrawer entry={editing} onClose={() => setEditing(null)} />
    </div>
  );
}

// ───────────── Apontamentos ─────────────

function EntriesTab() {
  const { t } = useI18n();
  const entries = useCollection('timeEntries');
  const assignments = useCollection('assignments');
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
                    <td className="td font-medium">
                      {emp.get(e.employeeId)?.name}
                      {isOffSchedule(e, assignments) && (
                        <Badge tone="red" className="ml-1.5">
                          {t('timesheet.offSchedule')}
                        </Badge>
                      )}
                    </td>
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
  const entries = useCollection('timeEntries');
  const open = isNew || !!entry;
  const blank: EntryDraft = { employeeId: '', projectId: '', phaseId: '', start: '', end: '', note: '', completesPhase: false };
  const [d, setD] = useState<EntryDraft>(blank);
  const [error, setError] = useState('');
  // Horas devem vir dos engenheiros pelo ponto: lançar/corrigir à mão exige motivo + frase digitada.
  const [guard, setGuard] = useState<'save' | 'delete' | null>(null);
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
    const err = validateEntry(draft) ?? entryOverlap(draft, entry?.id, entries);
    if (err) return setError(t(err));
    if (!d.note.trim()) return setError(t('timesheet.manual.reasonRequired'));
    setError('');
    setGuard('save');
  };
  const commitSave = () => {
    timesheetService.save({ ...d, end: d.end || undefined }, entry?.id);
    setGuard(null);
    toast.success(t('timesheet.saved'));
    onClose();
  };
  const empFirst = (employees.find((e) => e.id === d.employeeId)?.name.split(' ')[0] ?? '').toLowerCase();
  const prjNo = projects.find((p) => p.id === d.projectId)?.projectNumber ?? '';
  const phrase = `${empFirst}/${prjNo}`;

  const set = <K extends keyof EntryDraft>(k: K, v: EntryDraft[K]) => setD((x) => ({ ...x, [k]: v }));
  return (
    <Drawer
      open={open}
      onClose={onClose}
      title={isNew ? t('timesheet.new') : t('timesheet.edit')}
      footer={
        <div className="flex w-full items-center gap-2">
          {entry && (
            <Button variant="ghost" icon={Trash2} onClick={() => setGuard('delete')} className="text-red-600">
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
        <p className="flex gap-2 rounded-lg bg-amber-50 p-3 text-sm text-amber-900 dark:bg-amber-500/10 dark:text-amber-200">
          <TriangleAlert className="mt-0.5 size-4 shrink-0" /> {t('timesheet.manual.warning')}
        </p>
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
        <Field label={t('timesheet.manual.reason')} required hint={t('timesheet.manual.reasonHint')}>
          {(id) => <Input id={id} value={d.note} onChange={(e) => set('note', e.target.value)} />}
        </Field>
        {error && (
          <p role="alert" className="text-sm text-red-600">
            {error}
          </p>
        )}
      </form>
      <TypeToConfirm
        open={guard === 'save'}
        title={t(isNew ? 'timesheet.manual.addTitle' : 'timesheet.manual.editTitle')}
        message={t('timesheet.manual.confirmMessage')}
        phrase={phrase}
        confirmLabel={t('timesheet.manual.confirm')}
        danger={false}
        onCancel={() => setGuard(null)}
        onConfirm={commitSave}
      />
      <TypeToConfirm
        open={guard === 'delete'}
        title={t('timesheet.delete')}
        message={t('timesheet.deleteConfirm')}
        phrase={phrase}
        confirmLabel={t('timesheet.delete')}
        onCancel={() => setGuard(null)}
        onConfirm={() => {
          if (entry) timesheetService.remove(entry.id);
          setGuard(null);
          toast.success(t('timesheet.deleted'));
          onClose();
        }}
      />
    </Drawer>
  );
}

// ───────────── Serviços (progresso pelas fases) ─────────────

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
  const entries = useCollection('timeEntries');
  const allowed = useCan()('time.manage');
  /** Nº de apontamentos por fase: fase com histórico não pode ser removida (só desativada). */
  const usage = useMemo(() => {
    const m = new Map<string, number>();
    for (const e of entries) m.set(e.phaseId, (m.get(e.phaseId) ?? 0) + 1);
    return m;
  }, [entries]);
  const [list, setList] = useState<WorkPhase[]>([]);
  const [error, setError] = useState('');
  const [removing, setRemoving] = useState<WorkPhase>();
  useEffect(() => setList([...phases].sort((a, b) => a.order - b.order)), [phases]);
  const saved = (id: string) => phases.some((p) => p.id === id);

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
            <Button
              size="sm"
              variant="ghost"
              icon={Trash2}
              className="text-red-600 hover:text-red-700 dark:text-red-400"
              aria-label={t('timesheet.removePhase')}
              title={t('timesheet.removePhase')}
              disabled={list.length <= 1}
              onClick={() => setRemoving(p)}
            />
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
      <ConfirmDialog
        open={!!removing}
        title={t('timesheet.removePhaseTitle', { name: removing?.name || '—' })}
        message={
          removing && usage.get(removing.id)
            ? t('timesheet.removePhaseWithEntries', { count: usage.get(removing.id) ?? 0 })
            : t('timesheet.removePhaseMsg')
        }
        confirmLabel={t('timesheet.removePhase')}
        onCancel={() => setRemoving(undefined)}
        onConfirm={() => {
          const ph = removing;
          setRemoving(undefined);
          if (!ph) return;
          const rest = list.filter((x) => x.id !== ph.id);
          // Fase ainda não salva: só sai da lista. Salva: remove já (com os apontamentos), mantendo as outras edições.
          if (!saved(ph.id)) return setList(rest);
          if (rest.some((p) => !p.name.trim())) return setError(t('timesheet.phaseEmpty'));
          timesheetService.savePhases(rest.map((p) => ({ ...p, name: p.name.trim() })));
          setError('');
          toast.success(t('timesheet.phaseRemoved', { name: ph.name }));
        }}
      />
    </div>
  );
}

// ───────────── QR code ─────────────

/** Endereço do ponto: mesmo site, rota `#/clock`. */
export const clockUrl = () => `${window.location.origin}${window.location.pathname}#/clock`;

function QrTab() {
  const { t } = useI18n();
  return (
    <QrPoster
      hash="#/shop"
      title={t('shopHub.qrTitle')}
      hint={t('shopHub.qrHint')}
      posterTitle={t('shopHub.posterTitle')}
      posterText={t('shopHub.posterText')}
      fileName="ponto-oficina-qr.png"
      openLabel={t('timesheet.openClock')}
    />
  );
}
