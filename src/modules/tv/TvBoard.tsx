import { useEffect, useMemo, useState } from 'react';
import { Hourglass, Wrench } from 'lucide-react';
import { useRoute } from '@/app/router';
import { DisclaimerStrip } from '@/components/layout/Disclaimer';
import { BrandLogo } from '@/components/layout/BrandLogo';
import { useCollection } from '@/data/hooks';
import { enumLabel } from '@/domain/labels';
import { computeLanes, getVisibleDays } from '@/domain/schedule';
import { workerStatus } from '@/domain/timeTracking';
import { useI18n } from '@/i18n';
import { cn } from '@/lib/cn';
import { isWeekend, todayISO } from '@/lib/dates';
import { getFormatLocale, initials } from '@/lib/format';
import type { Absence, ProjectAssignment } from '@/types/models';

type TvView = 'week' | 'biweekly';
/** Só a primeira letra maiúscula ("Segunda-feira, 16 de novembro"). */
const cap = (s: string) => s.charAt(0).toUpperCase() + s.slice(1);

/**
 * Tela da TV da oficina (`#/tv`, `#/tv?view=biweekly`): rota da equipe só para leitura, em tela cheia, sem login.
 * Dias úteis nas colunas (fins de semana fora), colaboradores nas linhas, hoje destacado, férias hachuradas e
 * uma faixa "Agora na oficina" com quem está em qual fase. Atualiza sozinha (tempo real + relógio).
 */
export function TvBoard() {
  const { t } = useI18n();
  const { params } = useRoute();
  const view: TvView = params.get('view') === 'biweekly' ? 'biweekly' : 'week';
  const employees = useCollection('employees');
  const projects = useCollection('projects');
  const assignments = useCollection('assignments');
  const absences = useCollection('absences');
  const entries = useCollection('timeEntries');
  const phases = useCollection('workPhases');
  const [now, setNow] = useState(() => new Date());
  useEffect(() => {
    const id = setInterval(() => setNow(new Date()), 20_000);
    // Recarrega de madrugada/a cada 6 h: TV ligada dias seguidos sem acumular estado.
    const reload = setTimeout(() => window.location.reload(), 6 * 3600_000);
    return () => {
      clearInterval(id);
      clearTimeout(reload);
    };
  }, []);

  const today = todayISO();
  // Fim de semana aparece (mais estreito e acinzentado) para a equipe não se confundir com as datas.
  const days = useMemo(() => getVisibleDays(view, today).days, [view, today]);
  const cols = days.map((d) => (isWeekend(d) ? 'minmax(0, 0.45fr)' : 'minmax(0, 1fr)')).join(' ');
  const first = days[0]!;
  const last = days[days.length - 1]!;
  const projectsById = useMemo(() => new Map(projects.map((p) => [p.id, p])), [projects]);

  // Barras visíveis no período (sem projetos cancelados), recortadas aos dias úteis exibidos.
  const colOf = (start: string, end: string) => {
    const s = days.findIndex((d) => d >= start);
    let e = -1;
    for (let i = days.length - 1; i >= 0; i--) if (days[i]! <= end) { e = i; break; }
    return s === -1 || e === -1 || e < s ? null : { s, e };
  };
  const rows = employees
    .filter((e) => e.status === 'active')
    .map((e) => {
      const items = assignments.filter((a) => a.employeeId === e.id && a.endDate >= first && a.startDate <= last && projectsById.get(a.projectId)?.status !== 'canceled');
      const abs = absences.filter((a) => a.employeeId === e.id && a.endDate >= first && a.startDate <= last);
      return { e, items, abs, lanes: computeLanes(items), st: workerStatus(e.id, entries, phases, projectsById) };
    })
    .sort((a, b) => a.e.name.localeCompare(b.e.name));

  const dayHead = (d: string) => {
    const dt = new Date(`${d}T12:00:00`);
    return {
      wd: cap(dt.toLocaleDateString(getFormatLocale(), { weekday: view === 'week' ? 'long' : 'short' })),
      wdShort: cap(dt.toLocaleDateString(getFormatLocale(), { weekday: 'short' })),
      dm: dt.toLocaleDateString(getFormatLocale(), { day: '2-digit', month: '2-digit' }),
    };
  };
  const live = rows.filter((r) => r.st.flag !== 'idle');
  const phaseName = (id?: string) => phases.find((p) => p.id === id)?.name ?? '';

  return (
    <div className="flex h-dvh flex-col overflow-hidden bg-slate-950 text-white">
      <DisclaimerStrip className="py-1 text-[11px]" />
      {/* Cabeçalho */}
      <header className="flex items-center justify-between gap-6 px-[2vw] py-[1.2vh]">
        <div className="flex items-center gap-4">
          <BrandLogo className="h-[8vh] w-auto" />
          <div>
            <p className="text-[3.2vh] leading-tight font-bold">{t('tv.title')}</p>
            <p className="text-[1.8vh] text-slate-400">
              Ops · {view === 'week' ? t('tv.week') : t('tv.biweekly')} ·{' '}
              {new Date(`${first}T12:00:00`).toLocaleDateString(getFormatLocale(), { day: '2-digit', month: 'short' })} –{' '}
              {new Date(`${last}T12:00:00`).toLocaleDateString(getFormatLocale(), { day: '2-digit', month: 'short' })}
            </p>
          </div>
        </div>
        <div className="text-right">
          <p className="text-[4.4vh] leading-none font-bold tabular-nums">{now.toLocaleTimeString(getFormatLocale(), { hour: '2-digit', minute: '2-digit' })}</p>
          <p className="text-[1.8vh] text-slate-400">{cap(now.toLocaleDateString(getFormatLocale(), { weekday: 'long', day: '2-digit', month: 'long' }))}</p>
        </div>
      </header>

      {/* Grade */}
      <main className="min-h-0 flex-1 px-[2vw]">
        <div className="grid h-full" style={{ gridTemplateColumns: `minmax(12rem, 16vw) ${cols}`, gridTemplateRows: `auto repeat(${rows.length}, minmax(0, 1fr))` }}>
          <div />
          {days.map((d) => {
            const h = dayHead(d);
            const isToday = d === today;
            const we = isWeekend(d);
            return (
              <div key={d} className={cn('min-w-0 border-b border-slate-800 px-1 pb-[0.8vh] text-center', isToday && 'rounded-t-lg bg-brand-500 text-white', we && !isToday && 'bg-slate-800/60 text-slate-500')}>
                <p className={cn('truncate text-[1.7vh] font-semibold', !isToday && !we && 'text-slate-400')}>{isToday ? t('tv.today') : we ? h.wdShort : h.wd}</p>
                <p className={cn('font-bold tabular-nums', we ? 'text-[1.7vh]' : 'text-[2.2vh]')}>{h.dm}</p>
              </div>
            );
          })}

          {rows.map(({ e, items, abs, lanes, st }) => (
            <Row key={e.id}>
              {/* Nome */}
              <div className="flex min-w-0 items-center gap-3 border-b border-slate-800 pr-3">
                <span className="relative shrink-0">
                  <span className="flex size-[4.6vh] items-center justify-center rounded-full text-[1.8vh] font-bold" style={{ backgroundColor: e.color }}>
                    {initials(e.name)}
                  </span>
                  {st.flag === 'working' && <span className="absolute -right-0.5 -bottom-0.5 size-[1.6vh] animate-pulse rounded-full bg-green-400 ring-2 ring-slate-950" />}
                </span>
                <div className="min-w-0">
                  <p className="truncate text-[2.2vh] font-semibold">{e.name}</p>
                  <p className="truncate text-[1.5vh] text-slate-400">{e.role}</p>
                </div>
              </div>
              {/* Dias + barras (posicionadas sobre a linha) */}
              <div className="relative border-b border-slate-800" style={{ gridColumn: `span ${days.length}` }}>
                <div className="absolute inset-0 grid" style={{ gridTemplateColumns: cols }}>
                  {days.map((d) => (
                    <div key={d} className={cn('border-l border-slate-800/70', d === today && 'bg-brand-500/15', isWeekend(d) && 'bg-slate-800/60')} style={isWeekend(d) ? { backgroundImage: 'repeating-linear-gradient(135deg, rgba(148,163,184,.08) 0 6px, transparent 6px 12px)' } : undefined} />
                  ))}
                </div>
                <div className="absolute inset-x-0 inset-y-[0.5vh] grid gap-y-[0.5vh]" style={{ gridTemplateColumns: cols, gridTemplateRows: `repeat(${lanes.count}, minmax(0, 1fr))` }}>
                  {abs.map((a) => (
                    <AbsenceBar key={a.id} a={a} pos={colOf(a.startDate, a.endDate)} rows={lanes.count} label={enumLabel(t, 'absenceType', a.type)} />
                  ))}
                  {items.map((a) => (
                    <ProjectBar
                      key={a.id}
                      a={a}
                      pos={colOf(a.startDate, a.endDate)}
                      lane={lanes.lane.get(a.id) ?? 0}
                      project={projectsById.get(a.projectId)}
                      liveNow={st.flag === 'working' && st.projectId === a.projectId ? phaseName(st.open?.phaseId) : undefined}
                    />
                  ))}
                </div>
              </div>
            </Row>
          ))}
        </div>
      </main>

      {/* Agora na oficina */}
      <footer className="flex items-center gap-[1.2vw] overflow-hidden border-t border-slate-800 bg-slate-900 px-[2vw] py-[1.2vh]">
        <p className="flex shrink-0 items-center gap-2 text-[1.8vh] font-bold tracking-wide text-slate-300 uppercase">
          <Wrench className="size-[2.2vh]" /> {t('tv.now')}
        </p>
        {live.length === 0 ? (
          <p className="text-[1.8vh] text-slate-500">{t('tv.nobody')}</p>
        ) : (
          <div className="flex min-w-0 flex-wrap gap-[0.8vw]">
            {live.map(({ e, st }) => {
              const p = st.projectId ? projectsById.get(st.projectId) : undefined;
              return (
                <span
                  key={e.id}
                  className={cn(
                    'flex items-center gap-2 rounded-full px-3 py-[0.5vh] text-[1.7vh] font-semibold',
                    st.flag === 'working' ? 'bg-blue-600' : st.flag === 'waiting' ? 'bg-amber-400 text-amber-950' : 'bg-green-600',
                  )}
                >
                  {st.flag === 'waiting' && <Hourglass className="size-[1.8vh]" />}
                  {e.name.split(' ')[0]} · {p?.projectNumber} ·{' '}
                  {st.flag === 'working'
                    ? phaseName(st.open?.phaseId)
                    : st.flag === 'waiting'
                      ? t('timesheet.flow.waitingNext', { phase: st.progress?.next?.name ?? '' })
                      : t('timesheet.flow.ready')}
                </span>
              );
            })}
          </div>
        )}
      </footer>
    </div>
  );
}

const Row = ({ children }: { children: React.ReactNode }) => <>{children}</>;

function ProjectBar({ a, pos, lane, project, liveNow }: { a: ProjectAssignment; pos: { s: number; e: number } | null; lane: number; project?: { projectNumber: string; customer: string; color: string; status: string }; liveNow?: string }) {
  if (!pos || !project) return null;
  return (
    <div
      className={cn('mx-[0.25vw] flex min-w-0 flex-col justify-center overflow-hidden rounded-lg px-[0.6vw] shadow-lg', project.status === 'completed' && 'opacity-60', liveNow && 'ring-4 ring-green-400')}
      style={{ gridColumn: `${pos.s + 1} / ${pos.e + 2}`, gridRow: lane + 1, backgroundColor: project.color }}
      data-assignment={a.id}
    >
      <p className="truncate text-[2vh] leading-tight font-bold">{project.customer}</p>
      <p className="truncate font-mono text-[1.5vh] opacity-90">
        {project.projectNumber}
        {liveNow && <span className="ml-2 rounded bg-green-400 px-1.5 font-sans font-bold text-green-950">● {liveNow}</span>}
      </p>
    </div>
  );
}

function AbsenceBar({ a, pos, rows, label }: { a: Absence; pos: { s: number; e: number } | null; rows: number; label: string }) {
  if (!pos) return null;
  return (
    <div
      className="mx-[0.25vw] flex items-center justify-center rounded-lg border-2 border-dashed border-cyan-400/70 text-[1.8vh] font-semibold text-cyan-200"
      style={{
        gridColumn: `${pos.s + 1} / ${pos.e + 2}`,
        gridRow: `1 / ${rows + 1}`,
        backgroundImage: 'repeating-linear-gradient(135deg, rgba(34,211,238,.15) 0 10px, transparent 10px 20px)',
      }}
      data-absence={a.id}
    >
      {label}
    </div>
  );
}
