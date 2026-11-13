import { useEffect, useMemo, useRef, useState } from 'react';
import { ArrowLeft, Check, CheckCheck, Clock3, Cog, Delete, Lock, LogOut, Pause, Play, Search, TriangleAlert, Trophy } from 'lucide-react';
import { DisclaimerStrip } from '@/components/layout/Disclaimer';
import { Avatar } from '@/components/ui/misc';
import { useCollection } from '@/data/hooks';
import { isProjectActive } from '@/domain/purchasing';
import { canClock, clockService, currentJobOf, entryMinutes, formatMinutes, jobProgress, needsReview, openEntryOf, verifyClockPin } from '@/domain/timeTracking';
import { LOCALES, useI18n } from '@/i18n';
import type { TranslationKey } from '@/i18n/types';
import { APP_CONFIG } from '@/lib/config';
import { cn } from '@/lib/cn';
import { todayISO } from '@/lib/dates';
import { formatDate, getFormatLocale } from '@/lib/format';
import type { Employee, TimeEntry } from '@/types/models';

type Step =
  | { kind: 'who' }
  | { kind: 'pin'; employee: Employee }
  | { kind: 'home'; employee: Employee; pin: string }
  | { kind: 'done'; title: TranslationKey; entry: TimeEntry; hint?: string }
  | { kind: 'bye' };

const INACTIVITY_MS = 90_000;
const DONE_SECONDS = 6;

const timeOf = (iso: string) => new Date(iso).toLocaleTimeString(getFormatLocale(), { hour: '2-digit', minute: '2-digit' });

/**
 * Ponto da oficina (aberto pelo QR code da entrada): nome → PIN → serviço + fase → Iniciar/Encerrar.
 * Não usa o login do app; a "sessão" vive só nesta tela e termina sozinha após registrar.
 */
export function ClockPage() {
  const { t, locale, setLocale } = useI18n();
  const [step, setStep] = useState<Step>({ kind: 'who' });
  const employees = useCollection('employees');
  const lastAction = useRef(Date.now());

  // Sem uso por 90 s, a sessão fecha (celular esquecido aberto).
  useEffect(() => {
    if (step.kind === 'bye' || step.kind === 'done') return;
    lastAction.current = Date.now();
    const bump = () => (lastAction.current = Date.now());
    window.addEventListener('pointerdown', bump);
    window.addEventListener('keydown', bump);
    const timer = setInterval(() => {
      if (step.kind !== 'who' && Date.now() - lastAction.current > INACTIVITY_MS) setStep({ kind: 'bye' });
    }, 5000);
    return () => {
      window.removeEventListener('pointerdown', bump);
      window.removeEventListener('keydown', bump);
      clearInterval(timer);
    };
  }, [step.kind]);

  const clockable = employees.filter(canClock).sort((a, b) => a.name.localeCompare(b.name));

  return (
    <div className="flex min-h-dvh flex-col bg-slate-100 dark:bg-slate-950">
      <DisclaimerStrip />
      <header className="flex items-center justify-between gap-3 bg-slate-900 px-4 py-3 text-white">
        <div className="flex items-center gap-2.5">
          <span className="flex size-9 items-center justify-center rounded-lg bg-brand-500 text-slate-950">
            <Cog className="size-5" strokeWidth={2.5} />
          </span>
          <div className="leading-tight">
            <p className="font-bold">{t('clock.title')}</p>
            <p className="text-xs text-slate-400">{APP_CONFIG.appName}</p>
          </div>
        </div>
        <div className="flex gap-0.5">
          {LOCALES.map((l) => (
            <button key={l.value} onClick={() => setLocale(l.value)} className={cn('rounded-md px-2 py-1 text-xs font-semibold', locale === l.value ? 'bg-slate-700 text-white' : 'text-slate-400')}>
              {l.short}
            </button>
          ))}
        </div>
      </header>

      <main className="mx-auto w-full max-w-md min-w-0 flex-1 px-4 py-5">
        {step.kind === 'who' && <WhoStep employees={clockable} onPick={(employee) => setStep({ kind: 'pin', employee })} />}
        {step.kind === 'pin' && <PinStep employee={step.employee} onBack={() => setStep({ kind: 'who' })} onOk={(pin) => setStep({ kind: 'home', employee: step.employee, pin })} />}
        {step.kind === 'home' && <HomeStep employee={step.employee} pin={step.pin} onDone={(s) => setStep(s)} onExit={() => setStep({ kind: 'bye' })} />}
        {step.kind === 'done' && <DoneStep step={step} onClose={() => setStep({ kind: 'bye' })} />}
        {step.kind === 'bye' && (
          <div className="card mt-10 flex flex-col items-center gap-3 p-8 text-center">
            <LogOut className="size-10 text-slate-400" />
            <p className="text-base font-medium text-slate-700 dark:text-slate-200">{t('clock.bye')}</p>
          </div>
        )}
      </main>
    </div>
  );
}

function WhoStep({ employees, onPick }: { employees: Employee[]; onPick: (e: Employee) => void }) {
  const { t } = useI18n();
  return (
    <>
      <h1 className="mb-1 text-xl font-bold text-slate-900 dark:text-white">{t('clock.who')}</h1>
      <p className="mb-4 text-sm text-slate-500">{t('clock.subtitle')}</p>
      {employees.length === 0 ? (
        <p className="card p-5 text-sm text-slate-600 dark:text-slate-300">{t('clock.noPinEmployees')}</p>
      ) : (
        <ul className="grid gap-2">
          {employees.map((e) => (
            <li key={e.id}>
              <button onClick={() => onPick(e)} className="card flex w-full items-center gap-3 p-3 text-left active:scale-[0.99] hover:border-brand-500/60">
                <Avatar name={e.name} color={e.color} />
                <span className="min-w-0">
                  <span className="block truncate text-base font-semibold text-slate-900 dark:text-white">{e.name}</span>
                  <span className="block truncate text-xs text-slate-500">{e.role}</span>
                </span>
              </button>
            </li>
          ))}
        </ul>
      )}
    </>
  );
}

function PinStep({ employee, onBack, onOk }: { employee: Employee; onBack: () => void; onOk: (pin: string) => void }) {
  const { t } = useI18n();
  const [pin, setPin] = useState('');
  const [error, setError] = useState(false);

  const press = (d: string) => {
    setError(false);
    const next = (pin + d).slice(0, 6);
    setPin(next);
    if (next.length >= 4 && verifyClockPin(employee.id, next)) onOk(next);
  };
  const submit = () => {
    if (verifyClockPin(employee.id, pin)) onOk(pin);
    else {
      setError(true);
      setPin('');
    }
  };

  return (
    <>
      <BackBtn onClick={onBack} />
      <div className="mb-5 flex items-center gap-3">
        <Avatar name={employee.name} color={employee.color} size="lg" />
        <div>
          <p className="text-lg font-semibold text-slate-900 dark:text-white">{employee.name}</p>
          <p className="text-sm text-slate-500">{t('clock.pin')}</p>
        </div>
      </div>
      <div className="mb-2 flex justify-center gap-3" aria-live="polite" aria-label={t('clock.pin')}>
        {Array.from({ length: Math.max(4, pin.length) }).map((_, i) => (
          <span key={i} className={cn('size-4 rounded-full border-2', i < pin.length ? 'border-brand-500 bg-brand-500' : 'border-slate-300 dark:border-slate-600')} />
        ))}
      </div>
      <p className={cn('mb-4 min-h-5 text-center text-sm', error ? 'font-medium text-red-600' : 'text-slate-500')} role={error ? 'alert' : undefined}>
        {error ? t('clock.errors.pin') : t('clock.pinHint')}
      </p>
      <div className="grid grid-cols-3 gap-2">
        {['1', '2', '3', '4', '5', '6', '7', '8', '9'].map((d) => (
          <Key key={d} onClick={() => press(d)}>
            {d}
          </Key>
        ))}
        <Key onClick={() => setPin((p) => p.slice(0, -1))} aria-label="⌫">
          <Delete className="mx-auto size-6" />
        </Key>
        <Key onClick={() => press('0')}>0</Key>
        <Key onClick={submit} disabled={pin.length < 4} className="bg-brand-500 text-slate-950 dark:bg-brand-500">
          <Check className="mx-auto size-6" />
        </Key>
      </div>
    </>
  );
}

function Key({ className, ...p }: React.ButtonHTMLAttributes<HTMLButtonElement>) {
  return (
    <button
      type="button"
      {...p}
      className={cn(
        'h-16 rounded-xl bg-white text-2xl font-semibold text-slate-900 shadow-sm active:scale-95 disabled:opacity-40 dark:bg-slate-800 dark:text-white',
        className,
      )}
    />
  );
}

function HomeStep({ employee, pin, onDone, onExit }: { employee: Employee; pin: string; onDone: (s: Step) => void; onExit: () => void }) {
  const { t } = useI18n();
  const projects = useCollection('projects');
  const phases = useCollection('workPhases');
  const entries = useCollection('timeEntries');
  const assignments = useCollection('assignments');
  const employees = useCollection('employees');
  const [pickedId, setPickedId] = useState('');
  const [query, setQuery] = useState('');
  const [confirming, setConfirming] = useState(false);
  const [error, setError] = useState('');
  const [, tick] = useState(0);
  useEffect(() => {
    const id = setInterval(() => tick((n) => n + 1), 30_000);
    return () => clearInterval(id);
  }, []);

  const projectById = useMemo(() => new Map(projects.map((p) => [p.id, p])), [projects]);
  const phaseById = new Map(phases.map((p) => [p.id, p]));
  const empName = (id: string) => employees.find((e) => e.id === id)?.name.split(' ')[0] ?? '';
  const open = openEntryOf(employee.id, entries);
  const jobId = currentJobOf(employee.id, entries, phases, projectById) ?? open?.projectId;
  const job = jobId ? projectById.get(jobId) : undefined;
  const progress = jobId ? jobProgress(jobId, phases, entries) : undefined;

  // Serviços livres para escolher (sem serviço atual): ativos e com fase pendente; os do cronograma de hoje primeiro.
  const { mine, others } = useMemo(() => {
    const today = todayISO();
    const mineIds = new Set(assignments.filter((a) => a.employeeId === employee.id && a.startDate <= today && a.endDate >= today).map((a) => a.projectId));
    const startOf = new Map<string, string>();
    for (const a of assignments) if (!startOf.has(a.projectId) || a.startDate < startOf.get(a.projectId)!) startOf.set(a.projectId, a.startDate);
    const q = query.trim().toLowerCase();
    const list = projects
      .filter(isProjectActive)
      .map((p) => ({ p, prog: jobProgress(p.id, phases, entries) }))
      .filter(({ prog }) => !prog.complete && prog.next)
      .filter(({ p }) => !q || `${p.projectNumber} ${p.customer} ${p.description}`.toLowerCase().includes(q))
      // Prioridade: serviços já iniciados primeiro; depois pela data de início no cronograma (mais cedo = mais urgente).
      .sort(
        (a, b) =>
          Number(b.prog.started) - Number(a.prog.started) ||
          (startOf.get(a.p.id) ?? '9999').localeCompare(startOf.get(b.p.id) ?? '9999') ||
          a.p.projectNumber.localeCompare(b.p.projectNumber),
      );
    return { mine: list.filter(({ p }) => mineIds.has(p.id)), others: list.filter(({ p }) => !mineIds.has(p.id)) };
  }, [projects, phases, entries, assignments, employee.id, query]);

  const fail = (r: { error: Parameters<typeof t>[0]; vars?: Record<string, string> }) => setError(t(r.error, r.vars));
  const start = (projectId: string) => {
    const r = clockService.start(employee.id, pin, projectId);
    if (!r.ok) return fail(r);
    onDone({ kind: 'done', title: 'clock.doneStart', entry: r.entry });
  };
  const stop = (complete: boolean) => {
    const r = clockService.stop(employee.id, pin, complete);
    if (!r.ok) return fail(r);
    const next = jobProgress(r.entry.projectId, phases, [...entries.filter((e) => e.id !== r.entry.id), r.entry]).next;
    onDone({
      kind: 'done',
      title: r.jobComplete ? 'clock.jobDone' : complete ? 'clock.doneComplete' : 'clock.donePause',
      entry: r.entry,
      hint: r.jobComplete ? t('clock.jobDoneHint') : complete ? (next ? t('clock.nextUp', { phase: next.name }) : undefined) : t('clock.donePauseHint'),
    });
  };

  const header = (
    <div className="mb-4 flex items-center justify-between gap-3">
      <div className="flex items-center gap-3">
        <Avatar name={employee.name} color={employee.color} />
        <p className="text-lg font-semibold text-slate-900 dark:text-white">{t('clock.hello', { name: employee.name.split(' ')[0] ?? employee.name })}</p>
      </div>
      <button onClick={onExit} className="rounded-lg p-2 text-slate-500 hover:bg-slate-200 dark:hover:bg-slate-800" aria-label={t('clock.closeNow')}>
        <LogOut className="size-5" />
      </button>
    </div>
  );
  const errorBox = error && (
    <p role="alert" className="mb-3 flex gap-2 rounded-lg bg-red-50 p-3 text-sm font-medium text-red-700 dark:bg-red-500/10 dark:text-red-300">
      <TriangleAlert className="size-4 shrink-0" /> {error}
    </p>
  );

  // ── Com serviço atual: só este serviço, fase definida pela ordem ──
  if (job && progress) {
    const phase = open ? phaseById.get(open.phaseId) : progress.next;
    const resumed = !!phase && entries.some((e) => e.projectId === job.id && e.phaseId === phase.id);
    return (
      <>
        {header}
        {errorBox}
        <section className="card mb-4 border-l-4 p-4" style={{ borderLeftColor: job.color }}>
          <p className="text-xs font-semibold tracking-wide text-slate-500 uppercase">{t('clock.jobTitle')}</p>
          <p className="mt-1 font-mono text-xs text-slate-500">{job.projectNumber}</p>
          <p className="text-lg font-bold text-slate-900 dark:text-white">{job.customer}</p>
          <p className="truncate text-sm text-slate-500">{job.description}</p>
          <div className="mt-3 h-2 overflow-hidden rounded-full bg-slate-100 dark:bg-slate-800">
            <div className="h-full rounded-full bg-green-500" style={{ width: `${(progress.done / Math.max(1, progress.total)) * 100}%` }} />
          </div>
          <p className="mt-1 text-xs text-slate-500">{t('clock.progress', { done: progress.done, total: progress.total })}</p>
          <ol className="mt-3 space-y-1">
            {progress.phases.map(({ phase: ph, state }, i) => (
              <li key={ph.id} className={cn('flex items-center gap-2 text-sm', state === 'pending' && 'text-slate-400', (state === 'active' || state === 'next') && 'font-semibold text-slate-900 dark:text-white')}>
                <span
                  className={cn(
                    'flex size-5 shrink-0 items-center justify-center rounded-full text-[10px] font-bold',
                    state === 'done' ? 'bg-green-500 text-white' : state === 'active' ? 'bg-blue-600 text-white' : state === 'next' ? 'border-2 border-blue-600 text-blue-600' : 'border border-slate-300 dark:border-slate-600',
                  )}
                >
                  {state === 'done' ? <Check className="size-3" strokeWidth={3} /> : i + 1}
                </span>
                {ph.name}
                {state === 'active' && <span className="ml-auto text-xs font-medium text-blue-600">{t('timesheet.state.active')}</span>}
              </li>
            ))}
          </ol>
        </section>

        {open ? (
          <section className="card p-4">
            <p className="text-xs font-semibold tracking-wide text-slate-500 uppercase">{t('clock.phaseNow')}</p>
            <p className="mt-1 text-xl font-bold text-slate-900 dark:text-white">{phase?.name}</p>
            <p className="mt-1 flex items-center gap-1.5 text-sm text-slate-500">
              <Clock3 className="size-4" /> {t('clock.since', { time: timeOf(open.start), duration: formatMinutes(entryMinutes(open)) })}
            </p>
            {needsReview(open) && (
              <p className="mt-2 flex gap-1.5 rounded-lg bg-amber-50 p-2 text-xs text-amber-800 dark:bg-amber-500/10 dark:text-amber-300">
                <TriangleAlert className="size-4 shrink-0" /> {t('clock.review', { date: formatDate(open.start.slice(0, 10)) })}
              </p>
            )}
            <button
              onClick={() => (confirming ? stop(true) : setConfirming(true))}
              className={cn('mt-4 flex min-h-14 w-full items-center justify-center gap-2 rounded-xl px-3 text-lg font-semibold text-white active:scale-[0.99]', confirming ? 'bg-green-700 ring-4 ring-green-300' : 'bg-green-600')}
            >
              <CheckCheck className="size-6 shrink-0" /> {confirming ? t('clock.confirmComplete', { phase: phase?.name ?? '' }) : t('clock.complete', { phase: phase?.name ?? '' })}
            </button>
            <button onClick={() => stop(false)} className="mt-2 flex h-12 w-full items-center justify-center gap-2 rounded-xl bg-slate-200 font-semibold text-slate-800 active:scale-[0.99] dark:bg-slate-800 dark:text-slate-100">
              <Pause className="size-5" /> {t('clock.pause')}
            </button>
            <p className="mt-1 text-center text-xs text-slate-500">{t('clock.pauseHint')}</p>
          </section>
        ) : (
          phase && (
            <button onClick={() => start(job.id)} className="flex h-16 w-full items-center justify-center gap-2 rounded-xl bg-green-600 text-lg font-semibold text-white shadow-lg active:scale-[0.99]">
              <Play className="size-5 fill-current" /> {resumed ? t('clock.resume', { phase: phase.name }) : t('clock.startPhase', { phase: phase.name })}
            </button>
          )
        )}
        <p className="mt-4 flex gap-2 text-xs text-slate-500">
          <Lock className="size-4 shrink-0" /> {t('clock.jobHint')}
        </p>
      </>
    );
  }

  // ── Livre: escolher o próximo serviço ──
  const picked = [...mine, ...others].find(({ p }) => p.id === pickedId);
  const projectBtn = ({ p, prog }: (typeof mine)[number]) => {
    const busy = [...new Set(entries.filter((e) => e.projectId === p.id && !e.end).map((e) => empName(e.employeeId)))].filter(Boolean);
    return (
      <li key={p.id} className="min-w-0">
        <button
          onClick={() => setPickedId(p.id)}
          aria-pressed={pickedId === p.id}
          className={cn('flex w-full min-w-0 items-center gap-3 overflow-hidden rounded-xl border-2 bg-white p-3 text-left dark:bg-slate-900', pickedId === p.id ? 'border-brand-500' : 'border-transparent shadow-sm')}
        >
          <span className="h-10 w-1.5 shrink-0 rounded-full" style={{ backgroundColor: p.color }} />
          <span className="min-w-0 flex-1">
            <span className="block text-xs text-slate-500">
              <span className="font-mono">{p.projectNumber}</span> · {t('clock.progress', { done: prog.done, total: prog.total })}
            </span>
            <span className="block truncate font-semibold text-slate-900 dark:text-white">{p.customer}</span>
            <span className="block truncate text-xs text-slate-500">
              {t('clock.startsAt', { phase: prog.next?.name ?? '' })}
              {busy.length > 0 && ` · ${t('clock.busyWith', { names: busy.join(', ') })}`}
            </span>
          </span>
        </button>
      </li>
    );
  };

  return (
    <>
      {header}
      {errorBox}
      <h2 className="text-base font-semibold text-slate-900 dark:text-white">{t('clock.pickTitle')}</h2>
      <p className="mb-3 text-sm text-slate-500">{t('clock.pickHint')}</p>
      <label className="relative mb-2 block">
        <Search className="pointer-events-none absolute top-1/2 left-3 size-4 -translate-y-1/2 text-slate-400" />
        <input className="input h-11 pl-9 text-base" value={query} onChange={(e) => setQuery(e.target.value)} placeholder={t('clock.searchProject')} aria-label={t('clock.searchProject')} />
      </label>
      {mine.length > 0 && (
        <>
          <p className="mt-2 mb-1 text-xs text-slate-500">{t('clock.yourProjects')}</p>
          <ul className="grid grid-cols-1 gap-2 p-0.5">{mine.map(projectBtn)}</ul>
        </>
      )}
      {others.length > 0 && (
        <>
          <p className="mt-3 mb-1 text-xs text-slate-500">{t('clock.otherProjects')}</p>
          <ul className="grid grid-cols-1 gap-2 p-0.5">{others.map(projectBtn)}</ul>
        </>
      )}
      {mine.length + others.length === 0 && <p className="text-sm text-slate-500">{t('clock.noProjects')}</p>}
      <button
        onClick={() => picked && start(picked.p.id)}
        disabled={!picked}
        className={cn(
          'mt-4 flex h-14 w-full items-center justify-center gap-2 rounded-xl bg-green-600 text-lg font-semibold text-white shadow-lg active:scale-[0.99] disabled:bg-slate-300 disabled:text-slate-500 disabled:shadow-none dark:disabled:bg-slate-800',
          picked && 'sticky bottom-3 z-10',
        )}
      >
        <Play className="size-5 fill-current" /> {picked?.prog.next ? t('clock.startPhase', { phase: picked.prog.next.name }) : t('clock.start')}
      </button>
    </>
  );
}

function DoneStep({ step, onClose }: { step: Extract<Step, { kind: 'done' }>; onClose: () => void }) {
  const { t } = useI18n();
  const projects = useCollection('projects');
  const phases = useCollection('workPhases');
  const [left, setLeft] = useState(DONE_SECONDS);
  useEffect(() => {
    const id = setInterval(() => setLeft((s) => s - 1), 1000);
    return () => clearInterval(id);
  }, []);
  useEffect(() => {
    if (left <= 0) onClose();
  }, [left, onClose]);

  const phase = phases.find((p) => p.id === step.entry.phaseId)?.name ?? '';
  const project = projects.find((p) => p.id === step.entry.projectId);
  const ended = !!step.entry.end;
  const jobDone = step.title === 'clock.jobDone';
  return (
    <div className="card mt-6 flex flex-col items-center gap-2 p-8 text-center" role="status">
      <span className={cn('flex size-16 items-center justify-center rounded-full text-white', step.title === 'clock.donePause' ? 'bg-slate-600' : 'bg-green-600')}>
        {step.title === 'clock.donePause' ? <Pause className="size-8" /> : jobDone ? <Trophy className="size-8" /> : <Check className="size-9" strokeWidth={3} />}
      </span>
      <p className="mt-2 text-xl font-bold text-slate-900 dark:text-white">{t(step.title)}</p>
      <p className="text-sm text-slate-600 dark:text-slate-300">{t('clock.doneDetail', { phase, project: project?.projectNumber ?? '', time: timeOf(ended ? step.entry.end! : step.entry.start) })}</p>
      {ended && <p className="text-sm font-semibold text-slate-700 tabular-nums dark:text-slate-200">{formatMinutes(entryMinutes(step.entry))}</p>}
      {step.hint && <p className="mt-1 text-sm text-slate-500">{step.hint}</p>}
      <button onClick={onClose} className="mt-4 rounded-lg bg-slate-900 px-5 py-2.5 text-sm font-semibold text-white dark:bg-white dark:text-slate-900">
        {t('clock.closeNow')} · {t('clock.closing', { s: Math.max(0, left) })}
      </button>
    </div>
  );
}

function BackBtn({ onClick }: { onClick: () => void }) {
  const { t } = useI18n();
  return (
    <button onClick={onClick} className="mb-4 flex items-center gap-1 text-sm font-medium text-slate-600 dark:text-slate-300">
      <ArrowLeft className="size-4" /> {t('clock.back')}
    </button>
  );
}
