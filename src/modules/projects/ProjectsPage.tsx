import { useMemo, useState } from 'react';
import {
  AlertTriangle,
  CalendarRange,
  ChevronDown,
  ChevronUp,
  ClipboardList,
  Cog,
  FileText,
  FolderKanban,
  Hammer,
  PackageCheck,
  Search,
  Truck,
  type LucideIcon,
} from 'lucide-react';
import { navigate } from '@/app/router';
import { Badge, StatusBadge } from '@/components/ui/Badge';
import { Avatar, EmptyState, PageHeader, StatCard } from '@/components/ui/misc';
import { useCollection } from '@/data/hooks';
import { buildDossier, dossierSearchText, type MaterialTrail, type ProjectDossier, type TimelineKind } from '@/domain/projects';
import { isProjectActive } from '@/domain/purchasing';
import { useI18n } from '@/i18n';
import { cn } from '@/lib/cn';
import { formatCurrency, formatDate } from '@/lib/format';
import { usePersistentState } from '@/lib/usePersistentState';
import { usePurchasingData } from '@/modules/purchasing/usePurchasingData';
import type { ProjectAssignment } from '@/types/models';

type Filter = 'active' | 'finished' | 'all';
const FILTERS: Filter[] = ['active', 'finished', 'all'];
const isFilter = (v: unknown): v is Filter => FILTERS.includes(v as Filter);

/** Ficha de cada projeto: cotação, PO do cliente, produção/equipe, materiais pendentes e histórico. */
export function ProjectsPage() {
  const { t } = useI18n();
  const employees = useCollection('employees');
  const spindles = useCollection('spindles');
  const assignments = useCollection('assignments');
  const requisitions = useCollection('requisitions');
  const { projects, poById, readinessOf, today } = usePurchasingData();
  const [filter, setFilter] = usePersistentState<Filter>('projects.filter', 'active', isFilter);
  const [query, setQuery] = useState('');

  const dossiers = useMemo(() => {
    const byProject = new Map<string, ProjectAssignment[]>();
    for (const a of assignments) byProject.set(a.projectId, [...(byProject.get(a.projectId) ?? []), a]);
    const ctx = {
      employeesById: new Map(employees.map((e) => [e.id, e])),
      spindlesById: new Map(spindles.map((s) => [s.id, s])),
      poById,
      requisitions,
      assignmentsByProject: byProject,
      readinessOf,
    };
    // Em produção primeiro; depois os programados (mais próximos antes), sem data e concluídos (mais recentes antes).
    const rank = { in_production: 0, scheduled: 1, unscheduled: 2, finished: 3 } as const;
    return projects
      .map((p) => buildDossier(p, ctx, today))
      .sort(
        (a, b) =>
          rank[a.phase] - rank[b.phase] ||
          (a.phase === 'finished' ? (b.end ?? '').localeCompare(a.end ?? '') : (a.start ?? '').localeCompare(b.start ?? '')) ||
          a.project.projectNumber.localeCompare(b.project.projectNumber),
      );
  }, [projects, assignments, employees, spindles, requisitions, poById, readinessOf, today]);

  const active = dossiers.filter((d) => isProjectActive(d.project));
  const kpis = {
    active: active.length,
    inProduction: active.filter((d) => d.phase === 'in_production').length,
    waiting: active.filter((d) => d.pending.length > 0).length,
    atRisk: active.filter((d) => d.readiness.status === 'at_risk').length,
  };

  const q = query.trim().toLowerCase();
  const visible = dossiers.filter((d) => {
    if (filter === 'active' && !isProjectActive(d.project)) return false;
    if (filter === 'finished' && isProjectActive(d.project)) return false;
    return !q || dossierSearchText(d).includes(q);
  });

  return (
    <>
      <PageHeader icon={FolderKanban} title={t('projects.title')} description={t('projects.description')} />

      <div className="mb-6 grid grid-cols-2 gap-4 lg:grid-cols-4">
        <StatCard icon={FolderKanban} label={t('projects.kpis.active')} value={kpis.active} />
        <StatCard icon={Hammer} tone="info" label={t('projects.kpis.inProduction')} value={kpis.inProduction} />
        <StatCard icon={Truck} tone="warning" label={t('projects.kpis.waiting')} value={kpis.waiting} />
        <StatCard icon={AlertTriangle} tone={kpis.atRisk ? 'danger' : 'default'} label={t('projects.kpis.atRisk')} value={kpis.atRisk} />
      </div>

      <div className="card mb-6 flex flex-col gap-3 p-3 sm:flex-row sm:items-center">
        <label className="relative flex-1">
          <Search className="pointer-events-none absolute top-1/2 left-3 size-4 -translate-y-1/2 text-slate-400" />
          <input className="input pl-9" value={query} onChange={(e) => setQuery(e.target.value)} placeholder={t('projects.search')} aria-label={t('projects.search')} />
        </label>
        <div className="flex gap-1 rounded-lg bg-slate-100 p-1 dark:bg-slate-800" role="group">
          {FILTERS.map((f) => (
            <button
              key={f}
              onClick={() => setFilter(f)}
              aria-pressed={filter === f}
              className={cn(
                'rounded-md px-3 py-1.5 text-sm font-medium',
                filter === f ? 'bg-white text-slate-900 shadow-sm dark:bg-slate-700 dark:text-white' : 'text-slate-500 hover:text-slate-800 dark:hover:text-slate-200',
              )}
            >
              {t(`projects.filters.${f}`)}
            </button>
          ))}
        </div>
      </div>

      {visible.length === 0 ? (
        <EmptyState icon={FolderKanban} title={t('projects.empty')} description={t('projects.emptyHint')} />
      ) : (
        <div className="grid gap-4 xl:grid-cols-2">
          {visible.map((d) => (
            <ProjectCard key={d.project.id} d={d} />
          ))}
        </div>
      )}
    </>
  );
}

const PHASE_TONE = { unscheduled: 'slate', scheduled: 'cyan', in_production: 'blue', finished: 'green' } as const;

function ProjectCard({ d }: { d: ProjectDossier }) {
  const { t } = useI18n();
  const [showHistory, setShowHistory] = useState(false);
  const { project, spindle, customerPO } = d;
  const received = d.materials.length - d.pending.length;
  const MAX_PENDING = 4;

  return (
    <article className="card flex flex-col overflow-hidden">
      <div className="h-1.5" style={{ backgroundColor: project.color }} aria-hidden />
      <div className="flex flex-1 flex-col gap-4 p-5">
        {/* Cabeçalho */}
        <header className="flex flex-wrap items-start justify-between gap-2">
          <div className="min-w-0">
            <p className="font-mono text-xs font-semibold text-slate-500">{project.projectNumber}</p>
            <h2 className="truncate text-lg font-semibold text-slate-900 dark:text-white">{project.customer}</h2>
            {project.description && <p className="line-clamp-1 text-sm text-slate-500">{project.description}</p>}
          </div>
          <div className="flex flex-wrap gap-1.5">
            <StatusBadge kind="projectStatus" value={project.status} />
            {isProjectActive(project) && d.materials.length > 0 && <StatusBadge kind="readiness" value={d.readiness.status} />}
          </div>
        </header>

        {/* Fatos principais */}
        <dl className="grid gap-3 sm:grid-cols-2">
          <Fact icon={FileText} label={t('projects.quote')}>
            {spindle?.quoteNumber ? (
              <>
                <span className="font-mono">{spindle.quoteNumber}</span>
                {spindle.quoteDate && <> · {formatDate(spindle.quoteDate)}</>}
                {spindle.quotedValue > 0 && <> · <span className="font-semibold tabular-nums">{formatCurrency(spindle.quotedValue)}</span></>}
                <div className="mt-1">
                  <StatusBadge kind="quoteStatus" value={spindle.quoteStatus} />
                </div>
              </>
            ) : (
              <Muted>{t('projects.noQuote')}</Muted>
            )}
          </Fact>
          <Fact icon={ClipboardList} label={t('projects.customerPO')}>
            {customerPO ? (
              <>
                <LinkBtn onClick={() => navigate('/purchase-orders', { open: customerPO.id })}>{customerPO.poNumber}</LinkBtn> · {formatDate(customerPO.orderDate)}
                {d.customerPOTotal ? <> · <span className="font-semibold tabular-nums">{formatCurrency(d.customerPOTotal)}</span></> : null}
              </>
            ) : (
              <Muted>{t('projects.noCustomerPO')}</Muted>
            )}
          </Fact>
          <Fact icon={Hammer} label={t('projects.production')} className="sm:col-span-2">
            {d.start && d.end ? (
              <div className="flex flex-wrap items-center gap-x-3 gap-y-1.5">
                <Badge tone={PHASE_TONE[d.phase]} dot>
                  {t(`projects.phase.${d.phase}`)}
                </Badge>
                <span className="tabular-nums">
                  {formatDate(d.start)} → {formatDate(d.end)}
                </span>
                <span className="flex flex-wrap items-center gap-2">
                  {d.team.map((e) => (
                    <span key={e.id} className="inline-flex items-center gap-1.5">
                      <Avatar name={e.name} color={e.color} size="sm" />
                      <span className="text-slate-700 dark:text-slate-200">{e.name}</span>
                    </span>
                  ))}
                </span>
              </div>
            ) : (
              <Muted>{t('projects.notScheduled')}</Muted>
            )}
          </Fact>
        </dl>

        {/* Materiais */}
        <section>
          <div className="mb-2 flex items-center justify-between gap-2">
            <h3 className="flex items-center gap-1.5 text-xs font-semibold tracking-wide text-slate-500 uppercase">
              <PackageCheck className="size-3.5" /> {t('projects.materials')}
            </h3>
            {d.materials.length > 0 && <span className="text-xs text-slate-500 tabular-nums">{t('projects.matSummary', { received, total: d.materials.length })}</span>}
          </div>
          {d.materials.length === 0 ? (
            <Muted>{t('projects.noMaterials')}</Muted>
          ) : (
            <>
              <div className="mb-3 h-1.5 overflow-hidden rounded-full bg-slate-100 dark:bg-slate-800" role="progressbar" aria-valuemin={0} aria-valuemax={d.materials.length} aria-valuenow={received}>
                <div className="h-full rounded-full bg-green-500" style={{ width: `${(received / d.materials.length) * 100}%` }} />
              </div>
              {d.pending.length === 0 ? (
                <p className="text-sm text-green-700 dark:text-green-400">{t('projects.allReceived')}</p>
              ) : (
                <>
                  <p className="mb-1.5 text-xs font-medium text-slate-500">{t('projects.pendingTitle')}</p>
                  <ul className="divide-y divide-slate-100 rounded-lg border border-slate-200 dark:divide-slate-800 dark:border-slate-800">
                    {d.pending.slice(0, MAX_PENDING).map((m) => (
                      <PendingMaterial key={m.material.id} m={m} />
                    ))}
                  </ul>
                  {d.pending.length > MAX_PENDING && (
                    <LinkBtn className="mt-1.5 text-xs" onClick={() => navigate('/calendar', { open: project.id })}>
                      {t('projects.more', { count: d.pending.length - MAX_PENDING })}
                    </LinkBtn>
                  )}
                </>
              )}
            </>
          )}
        </section>

        {/* Histórico */}
        {d.timeline.length > 0 && (
          <section>
            <button onClick={() => setShowHistory((v) => !v)} aria-expanded={showHistory} className="flex items-center gap-1 text-sm font-medium text-brand-700 hover:underline dark:text-brand-400">
              {showHistory ? <ChevronUp className="size-4" /> : <ChevronDown className="size-4" />}
              {showHistory ? t('projects.hideHistory') : t('projects.showHistory', { count: d.timeline.length })}
            </button>
            {showHistory && <Timeline d={d} />}
          </section>
        )}

        {/* Ações */}
        <footer className="mt-auto flex flex-wrap gap-2 border-t border-slate-100 pt-3 dark:border-slate-800">
          <ActionBtn icon={CalendarRange} onClick={() => navigate('/calendar', { open: project.id })}>
            {t('projects.open.schedule')}
          </ActionBtn>
          {spindle && (
            <ActionBtn icon={Cog} onClick={() => navigate('/financial', { open: spindle.id })}>
              {t('projects.open.financial')}
            </ActionBtn>
          )}
          {d.requisitions[0] && (
            <ActionBtn icon={Truck} onClick={() => navigate('/purchase-orders', { req: d.requisitions[d.requisitions.length - 1]!.req.id })}>
              {t('projects.open.purchasing')}
            </ActionBtn>
          )}
        </footer>
      </div>
    </article>
  );
}

function PendingMaterial({ m }: { m: MaterialTrail }) {
  const { t } = useI18n();
  const { material, requisition, po, expectedDate, late } = m;
  return (
    <li className="px-3 py-2 text-sm">
      <div className="flex items-start justify-between gap-2">
        <p className="min-w-0">
          <span className="font-mono text-xs text-slate-500">{material.partNumber}</span>{' '}
          <span className="text-slate-800 dark:text-slate-100">{material.description}</span> <span className="text-slate-500 tabular-nums">× {material.quantity}</span>
        </p>
        <StatusBadge kind="materialStatus" value={m.status} />
      </div>
      <p className="mt-0.5 flex flex-wrap gap-x-2 text-xs text-slate-500">
        {requisition ? (
          <span>
            {t('projects.requested', { date: formatDate(requisition.requestedAt) })} ·{' '}
            <LinkBtn onClick={() => navigate('/purchase-orders', { req: requisition.id })}>{requisition.number}</LinkBtn>
          </span>
        ) : (
          !po && <span>{t('projects.notRequested')}</span>
        )}
        {po && (
          <span>
            {requisition && '→ '}
            {t('projects.ordered', { date: formatDate(po.orderDate) })} <LinkBtn onClick={() => navigate('/purchase-orders', { open: po.id })}>{po.poNumber}</LinkBtn>
          </span>
        )}
        {expectedDate && (
          <span className={cn(late && 'font-semibold text-red-600 dark:text-red-400')}>
            · {t('projects.eta', { date: formatDate(expectedDate) })}
            {late && ` (${t('projects.late')})`}
          </span>
        )}
        {m.receivedQty > 0 && <span>· {t('projects.partial', { qty: m.receivedQty })}</span>}
      </p>
    </li>
  );
}

const EVENT_ICON: Record<TimelineKind, LucideIcon> = {
  received: Cog,
  quote: FileText,
  customer_po: ClipboardList,
  requisition: ClipboardList,
  purchase_po: Truck,
  goods_receipt: PackageCheck,
  production_start: Hammer,
  production_end: Hammer,
  delivery: Truck,
};

function Timeline({ d }: { d: ProjectDossier }) {
  const { t } = useI18n();
  return (
    <ol className="mt-3 space-y-0 border-l-2 border-slate-200 pl-4 dark:border-slate-700">
      {d.timeline.map((e, i) => {
        const Icon = EVENT_ICON[e.kind];
        return (
          <li key={i} className={cn('relative pb-3 last:pb-0', e.planned && 'opacity-70')}>
            <span
              className={cn(
                'absolute top-0.5 -left-[25px] flex size-4 items-center justify-center rounded-full ring-4 ring-white dark:ring-slate-900',
                e.planned ? 'border border-dashed border-slate-400 bg-white dark:bg-slate-900' : 'bg-slate-700 text-white dark:bg-slate-300 dark:text-slate-900',
              )}
            >
              <Icon className="size-2.5" />
            </span>
            <p className="text-xs text-slate-500 tabular-nums">
              {formatDate(e.date)}
              {e.planned && ` · ${t('projects.planned')}`}
            </p>
            <p className="text-sm text-slate-800 dark:text-slate-100">
              <span className="font-medium">{t(`projects.events.${e.kind}`)}</span>
              {e.ref && <span className="text-slate-600 dark:text-slate-300"> — {e.ref}</span>}
              {e.amount ? <span className="font-semibold tabular-nums"> · {formatCurrency(e.amount)}</span> : null}
            </p>
          </li>
        );
      })}
    </ol>
  );
}

function Fact({ icon: Icon, label, children, className }: { icon: LucideIcon; label: string; children: React.ReactNode; className?: string }) {
  return (
    <div className={cn('rounded-lg bg-slate-50 p-3 dark:bg-slate-800/50', className)}>
      <dt className="mb-1 flex items-center gap-1.5 text-xs font-semibold tracking-wide text-slate-500 uppercase">
        <Icon className="size-3.5" /> {label}
      </dt>
      <dd className="text-sm text-slate-800 dark:text-slate-100">{children}</dd>
    </div>
  );
}

const Muted = ({ children }: { children: React.ReactNode }) => <span className="text-sm text-slate-400 dark:text-slate-500">{children}</span>;

function LinkBtn({ children, onClick, className }: { children: React.ReactNode; onClick: () => void; className?: string }) {
  return (
    <button type="button" onClick={onClick} className={cn('font-mono font-medium text-brand-700 hover:underline dark:text-brand-400', className)}>
      {children}
    </button>
  );
}

function ActionBtn({ icon: Icon, children, onClick }: { icon: LucideIcon; children: React.ReactNode; onClick: () => void }) {
  return (
    <button
      type="button"
      onClick={onClick}
      className="inline-flex items-center gap-1.5 rounded-lg border border-slate-200 px-2.5 py-1.5 text-xs font-medium text-slate-700 hover:border-brand-500/60 hover:text-slate-900 dark:border-slate-700 dark:text-slate-200 dark:hover:text-white"
    >
      <Icon className="size-3.5" /> {children}
    </button>
  );
}
