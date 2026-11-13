import { useEffect, useMemo, useRef, useState } from 'react';
import { ArrowLeft, Check, Clock3, Cog, Delete, LogOut, Play, Search, Square, TriangleAlert } from 'lucide-react';
import { DisclaimerStrip } from '@/components/layout/Disclaimer';
import { Avatar } from '@/components/ui/misc';
import { useCollection } from '@/data/hooks';
import { isProjectActive } from '@/domain/purchasing';
import { activePhases, canClock, clockService, entryMinutes, formatMinutes, needsReview, openEntryOf, verifyClockPin } from '@/domain/timeTracking';
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
  | { kind: 'done'; title: TranslationKey; entry: TimeEntry; closed?: TimeEntry }
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
  const [projectId, setProjectId] = useState('');
  const [phaseId, setPhaseId] = useState('');
  const [query, setQuery] = useState('');
  const [, tick] = useState(0);
  useEffect(() => {
    const id = setInterval(() => tick((n) => n + 1), 30_000);
    return () => clearInterval(id);
  }, []);

  const open = openEntryOf(employee.id, entries);
  const projectById = new Map(projects.map((p) => [p.id, p]));
  const phaseById = new Map(phases.map((p) => [p.id, p]));
  const phaseList = activePhases(phases);

  const { mine, others } = useMemo(() => {
    const today = todayISO();
    const mineIds = new Set(assignments.filter((a) => a.employeeId === employee.id && a.startDate <= today && a.endDate >= today).map((a) => a.projectId));
    const q = query.trim().toLowerCase();
    const list = projects
      .filter(isProjectActive)
      .filter((p) => !q || `${p.projectNumber} ${p.customer} ${p.description}`.toLowerCase().includes(q))
      .sort((a, b) => a.projectNumber.localeCompare(b.projectNumber));
    return { mine: list.filter((p) => mineIds.has(p.id)), others: list.filter((p) => !mineIds.has(p.id)) };
  }, [projects, assignments, employee.id, query]);

  const start = () => {
    const r = clockService.start(employee.id, pin, projectId, phaseId);
    if (r.ok) onDone({ kind: 'done', title: 'clock.doneStart', entry: r.entry, closed: r.closed });
  };
  const stop = () => {
    const r = clockService.stop(employee.id, pin);
    if (r.ok) onDone({ kind: 'done', title: 'clock.doneStop', entry: r.entry });
  };

  const projectBtn = (p: (typeof projects)[number]) => (
    <li key={p.id} className="min-w-0">
      <button
        onClick={() => setProjectId(p.id)}
        aria-pressed={projectId === p.id}
        className={cn(
          'flex w-full min-w-0 items-center gap-3 overflow-hidden rounded-xl border-2 bg-white p-3 text-left dark:bg-slate-900',
          projectId === p.id ? 'border-brand-500' : 'border-transparent shadow-sm',
        )}
      >
        <span className="h-9 w-1.5 shrink-0 rounded-full" style={{ backgroundColor: p.color }} />
        <span className="min-w-0 flex-1">
          <span className="block font-mono text-xs text-slate-500">{p.projectNumber}</span>
          <span className="block truncate font-semibold text-slate-900 dark:text-white">{p.customer}</span>
          <span className="block truncate text-xs text-slate-500">{p.description}</span>
        </span>
      </button>
    </li>
  );

  return (
    <>
      <div className="mb-4 flex items-center justify-between gap-3">
        <div className="flex items-center gap-3">
          <Avatar name={employee.name} color={employee.color} />
          <p className="text-lg font-semibold text-slate-900 dark:text-white">{t('clock.hello', { name: employee.name.split(' ')[0] ?? employee.name })}</p>
        </div>
        <button onClick={onExit} className="rounded-lg p-2 text-slate-500 hover:bg-slate-200 dark:hover:bg-slate-800" aria-label={t('clock.closeNow')}>
          <LogOut className="size-5" />
        </button>
      </div>

      {/* Fase em andamento */}
      {open ? (
        <section className="card mb-5 border-l-4 p-4" style={{ borderLeftColor: projectById.get(open.projectId)?.color }}>
          <p className="text-xs font-semibold tracking-wide text-slate-500 uppercase">{t('clock.nowOn')}</p>
          <p className="mt-1 text-lg font-bold text-slate-900 dark:text-white">{phaseById.get(open.phaseId)?.name ?? '—'}</p>
          <p className="text-sm text-slate-600 dark:text-slate-300">
            <span className="font-mono">{projectById.get(open.projectId)?.projectNumber}</span> · {projectById.get(open.projectId)?.customer}
          </p>
          <p className="mt-1 flex items-center gap-1.5 text-sm text-slate-500">
            <Clock3 className="size-4" /> {t('clock.since', { time: timeOf(open.start), duration: formatMinutes(entryMinutes(open)) })}
          </p>
          {needsReview(open) && (
            <p className="mt-2 flex gap-1.5 rounded-lg bg-amber-50 p-2 text-xs text-amber-800 dark:bg-amber-500/10 dark:text-amber-300">
              <TriangleAlert className="size-4 shrink-0" /> {t('clock.review', { date: formatDate(open.start.slice(0, 10)) })}
            </p>
          )}
          <button onClick={stop} className="mt-3 flex h-14 w-full items-center justify-center gap-2 rounded-xl bg-red-600 text-lg font-semibold text-white active:scale-[0.99]">
            <Square className="size-5 fill-current" /> {t('clock.stop')}
          </button>
        </section>
      ) : (
        <p className="card mb-5 p-4 text-sm text-slate-600 dark:text-slate-300">{t('clock.idle')}</p>
      )}

      {/* Iniciar / trocar */}
      <section>
        <h2 className="mb-2 text-base font-semibold text-slate-900 dark:text-white">{open ? t('clock.switchTitle') : t('clock.startTitle')}</h2>
        <p className="mb-1.5 text-xs font-semibold tracking-wide text-slate-500 uppercase">1 · {t('clock.project')}</p>
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
            <ul className="grid max-h-72 grid-cols-1 gap-2 overflow-x-hidden overflow-y-auto p-0.5">{others.map(projectBtn)}</ul>
          </>
        )}
        {mine.length + others.length === 0 && <p className="text-sm text-slate-500">{t('clock.noProjects')}</p>}

        <p className="mt-5 mb-1.5 text-xs font-semibold tracking-wide text-slate-500 uppercase">2 · {t('clock.phase')}</p>
        <div className="grid grid-cols-2 gap-2">
          {phaseList.map((ph) => (
            <button
              key={ph.id}
              onClick={() => setPhaseId(ph.id)}
              aria-pressed={phaseId === ph.id}
              className={cn(
                'min-h-14 rounded-xl border-2 px-3 py-2 text-sm font-semibold',
                phaseId === ph.id ? 'border-brand-500 bg-brand-50 text-slate-900 dark:bg-brand-500/15 dark:text-white' : 'border-transparent bg-white text-slate-700 shadow-sm dark:bg-slate-900 dark:text-slate-200',
              )}
            >
              {ph.name}
            </button>
          ))}
        </div>

        {open && projectId && phaseId && (
          <p className="mt-3 text-center text-xs text-slate-500">{t('clock.willClose', { phase: phaseById.get(open.phaseId)?.name ?? '' })}</p>
        )}
        <button
          onClick={start}
          disabled={!projectId || !phaseId}
          className={cn(
            'mt-3 flex h-14 w-full items-center justify-center gap-2 rounded-xl bg-green-600 text-lg font-semibold text-white shadow-lg active:scale-[0.99] disabled:bg-slate-300 disabled:text-slate-500 disabled:shadow-none dark:disabled:bg-slate-800',
            projectId && phaseId && 'sticky bottom-3 z-10',
          )}
        >
          <Play className="size-5 fill-current" /> {t('clock.start')}
        </button>
      </section>
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

  const phase = (id: string) => phases.find((p) => p.id === id)?.name ?? '';
  const project = projects.find((p) => p.id === step.entry.projectId);
  const stopped = step.title === 'clock.doneStop';
  return (
    <div className="card mt-6 flex flex-col items-center gap-2 p-8 text-center" role="status">
      <span className={cn('flex size-16 items-center justify-center rounded-full text-white', stopped ? 'bg-slate-700' : 'bg-green-600')}>
        <Check className="size-9" strokeWidth={3} />
      </span>
      <p className="mt-2 text-xl font-bold text-slate-900 dark:text-white">{t(step.title)}</p>
      <p className="text-sm text-slate-600 dark:text-slate-300">
        {t('clock.doneDetail', { phase: phase(step.entry.phaseId), project: project?.projectNumber ?? '', time: timeOf(stopped ? step.entry.end! : step.entry.start) })}
      </p>
      {stopped && <p className="text-sm font-semibold text-slate-700 tabular-nums dark:text-slate-200">{formatMinutes(entryMinutes(step.entry))}</p>}
      {step.closed && <p className="mt-1 text-xs text-slate-500">{t('clock.closedPrev', { phase: phase(step.closed.phaseId), duration: formatMinutes(entryMinutes(step.closed)) })}</p>}
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
