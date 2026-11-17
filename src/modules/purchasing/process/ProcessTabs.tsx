import { useMemo, useState } from 'react';
import { AlertTriangle, ArrowDownWideNarrow, ArrowUpWideNarrow, FileInput, PackageCheck, Search, X } from 'lucide-react';
import { useCan, useCurrentUser } from '@/app/session';
import { Badge, StatusBadge } from '@/components/ui/Badge';
import { Button } from '@/components/ui/Button';
import { Input, Select } from '@/components/ui/Field';
import { EmptyState } from '@/components/ui/misc';
import { useCollection } from '@/data/hooks';
import { effectiveStatus, openQty, receivedQty, requisitionItemViews, stageOf, STAGES, unseenPOEvents, unseenRejection, type Stage } from '@/domain/requisitions';
import { useI18n } from '@/i18n';
import { cn } from '@/lib/cn';
import { formatDate } from '@/lib/format';
import { usePersistentState } from '@/lib/usePersistentState';
import { usePurchasingData } from '../usePurchasingData';
import { GRDrawer } from './GRDrawer';
import { StageStepper } from './RequisitionPage';

export type StageFilter = 'open' | Stage | 'closed' | 'all';
const isSort = (v: unknown): v is 'newest' | 'oldest' => v === 'newest' || v === 'oldest';

/** Pedidos de compra por data do pedido (mais novos ou mais antigos primeiro), com filtros por etapa, solicitante, projeto, fornecedor, período e busca. */
export function RequisitionsTab({ stage, onStage, onOpen }: { stage: StageFilter; onStage: (s: StageFilter) => void; onOpen: (id: string) => void }) {
  const me = useCurrentUser();
  const { t } = useI18n();
  const pd = usePurchasingData();
  const requisitions = useCollection('requisitions');
  const users = useCollection('users');
  const [sort, setSort] = usePersistentState<'newest' | 'oldest'>('purchasing.reqSort', 'newest', isSort);
  const [requester, setRequester] = useState('');
  const [projectId, setProjectId] = useState('');
  const [supplierId, setSupplierId] = useState('');
  const [from, setFrom] = useState('');
  const [to, setTo] = useState('');
  const [query, setQuery] = useState('');

  const all = useMemo(
    () =>
      requisitions.map((r) => {
        const project = pd.projects.find((p) => p.id === r.projectId);
        const views = requisitionItemViews(r, project, pd.poById);
        const status = effectiveStatus(r, views);
        const sups = [...new Set(r.items.flatMap((it, i) => [...(it.suppliers ?? []).map((x) => x.supplierId), views[i]?.po?.supplierId]).filter((x): x is string => !!x))];
        return {
          r,
          project,
          views,
          status,
          st: stageOf(status),
          sups,
          isNew: r.requestedBy === me?.id && unseenPOEvents(r).length > 0,
          isRejected: r.requestedBy === me?.id && unseenRejection(r),
        };
      }),
    [requisitions, pd, me],
  );

  const counts = useMemo(() => {
    const c: Record<string, number> = { open: 0, closed: 0, all: all.length };
    for (const x of all) {
      c[x.st] = (c[x.st] ?? 0) + 1;
      if (x.st !== 'closed' && x.st !== 'received') c.open!++;
    }
    return c;
  }, [all]);

  const q = query.trim().toLowerCase();
  const rows = all
    .filter((x) => {
      if (stage === 'all') return true;
      if (stage === 'open') return x.isNew || x.isRejected || (x.st !== 'closed' && x.st !== 'received');
      return x.st === stage;
    })
    .filter((x) => !requester || x.r.requestedBy === requester)
    .filter((x) => !projectId || x.r.projectId === projectId)
    .filter((x) => !supplierId || x.sups.includes(supplierId))
    .filter((x) => (!from || x.r.requestedAt.slice(0, 10) >= from) && (!to || x.r.requestedAt.slice(0, 10) <= to))
    .filter((x) => !q || [x.r.number, x.project?.projectNumber ?? '', x.project?.customer ?? '', x.r.notes, ...x.r.items.map((it) => `${it.partNumber} ${it.description}`), ...x.sups.map((s) => pd.suppliersById.get(s)?.name ?? '')].some((f) => f.toLowerCase().includes(q)))
    .sort((a, b) => Number(b.isNew || b.isRejected) - Number(a.isNew || a.isRejected) || (sort === 'newest' ? b.r.requestedAt.localeCompare(a.r.requestedAt) : a.r.requestedAt.localeCompare(b.r.requestedAt)));

  const requesters = [...new Set(requisitions.map((r) => r.requestedBy))].map((id) => ({ value: id, label: users.find((u) => u.id === id)?.name ?? '—' }));
  const projects = [...new Set(requisitions.map((r) => r.projectId))].map((id) => pd.projects.find((p) => p.id === id)).filter((p): p is NonNullable<typeof p> => !!p);
  const supplierOpts = [...new Set(all.flatMap((x) => x.sups))].map((id) => pd.suppliersById.get(id)).filter((s): s is NonNullable<typeof s> => !!s).sort((a, b) => a.name.localeCompare(b.name));
  const filtered = !!(requester || projectId || supplierId || from || to || q);
  const chips: StageFilter[] = ['open', ...STAGES, 'closed', 'all'];
  const chipLabel = (s: StageFilter) => (s === 'open' ? t('process.list.allStages') : s === 'all' ? t('process.req.filterAll') : s === 'closed' ? t('process.list.closed') : `${STAGES.indexOf(s) + 1} · ${t(`process.stages.${s}`)}`);

  return (
    <div className="card overflow-hidden">
      <div className="space-y-3 border-b border-slate-200 p-4 dark:border-slate-800">
        <div className="-mx-1 flex gap-1.5 overflow-x-auto px-1 pb-1">
          {chips.map((s) => (
            <button
              key={s}
              onClick={() => onStage(s)}
              aria-pressed={stage === s}
              className={cn(
                'flex shrink-0 items-center gap-1.5 rounded-full border px-3 py-1 text-xs font-medium whitespace-nowrap',
                stage === s ? 'border-slate-900 bg-slate-900 text-white dark:border-white dark:bg-white dark:text-slate-900' : 'border-slate-300 text-slate-600 hover:bg-slate-50 dark:border-slate-700 dark:text-slate-400 dark:hover:bg-slate-800',
              )}
            >
              {chipLabel(s)}
              <span className={cn('rounded-full px-1.5 text-[10px] tabular-nums', stage === s ? 'bg-white/20' : 'bg-slate-100 dark:bg-slate-800')}>{counts[s] ?? 0}</span>
            </button>
          ))}
        </div>
        <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-[minmax(0,2fr)_repeat(3,minmax(0,1fr))]">
          <div className="relative">
            <Search className="pointer-events-none absolute top-1/2 left-3 size-4 -translate-y-1/2 text-slate-400" />
            <input className="input pl-9" placeholder={t('process.list.search')} value={query} onChange={(e) => setQuery(e.target.value)} aria-label={t('common.search')} />
          </div>
          <Select value={requester} onChange={setRequester} options={[{ value: '', label: t('process.list.allRequesters') }, ...requesters]} aria-label={t('process.req.requestedBy')} />
          <Select value={projectId} onChange={setProjectId} options={[{ value: '', label: t('process.list.allProjects') }, ...projects.map((p) => ({ value: p.id, label: `${p.projectNumber} · ${p.customer}` }))]} aria-label={t('process.req.project')} />
          <Select value={supplierId} onChange={setSupplierId} options={[{ value: '', label: t('process.list.allSuppliers') }, ...supplierOpts.map((s) => ({ value: s.id, label: s.name }))]} aria-label={t('process.list.suppliersCol')} />
        </div>
        <div className="flex flex-wrap items-center gap-2 text-sm">
          <label className="flex items-center gap-1.5 text-slate-500">
            {t('process.list.dateFrom')}
            <Input type="date" className="w-auto" value={from} onChange={(e) => setFrom(e.target.value)} />
          </label>
          <label className="flex items-center gap-1.5 text-slate-500">
            {t('process.list.dateTo')}
            <Input type="date" className="w-auto" value={to} onChange={(e) => setTo(e.target.value)} />
          </label>
          {filtered && (
            <Button size="sm" variant="ghost" icon={X} onClick={() => { setRequester(''); setProjectId(''); setSupplierId(''); setFrom(''); setTo(''); setQuery(''); }}>
              {t('process.list.clear')}
            </Button>
          )}
          <span className="ml-auto text-xs text-slate-500">{t('process.list.showing', { count: rows.length })}</span>
          <Button size="sm" icon={sort === 'newest' ? ArrowDownWideNarrow : ArrowUpWideNarrow} onClick={() => setSort(sort === 'newest' ? 'oldest' : 'newest')}>
            {sort === 'newest' ? t('process.list.newest') : t('process.list.oldest')}
          </Button>
        </div>
      </div>

      {rows.length === 0 ? (
        <EmptyState icon={FileInput} title={t('process.req.empty')} />
      ) : (
        <ul className="divide-y divide-slate-100 dark:divide-slate-800">
          {rows.map(({ r, project, views, status, sups, isNew, isRejected }) => {
            const ordered = views.filter((v) => v.status === 'ordered' || v.status === 'received').length;
            const received = views.filter((v) => v.status === 'received').length;
            const first = r.items[0];
            return (
              <li key={r.id} className="min-w-0">
                <button type="button" onClick={() => onOpen(r.id)} className="grid w-full min-w-0 gap-x-4 gap-y-1.5 px-4 py-3 text-left hover:bg-slate-50 sm:grid-cols-[8.5rem_minmax(0,1fr)_minmax(0,12rem)_9rem] sm:items-center dark:hover:bg-slate-800/40">
                  <div className="flex items-center gap-2 sm:block">
                    <p className="text-sm font-semibold text-slate-900 dark:text-white">{formatDate(r.requestedAt)}</p>
                    <p className="flex items-center gap-1.5 font-mono text-xs text-slate-500">
                      {r.number}
                      {isRejected && <span className="rounded-full bg-yellow-300 px-1.5 py-0.5 font-sans text-[10px] font-bold text-yellow-950">{t('process.rejectedTag')}</span>}
                      {isNew && <span className="rounded-full bg-green-500 px-1.5 py-0.5 font-sans text-[10px] font-bold text-white">{t('process.newPOTag')}</span>}
                    </p>
                  </div>
                  <div className="min-w-0">
                    <p className="truncate text-sm font-medium">
                      {first?.description}
                      {r.items.length > 1 && <span className="font-normal text-slate-500"> +{r.items.length - 1}</span>}
                    </p>
                    <p className="flex min-w-0 items-center gap-1.5 truncate text-xs text-slate-500">
                      {project && (
                        <span className="shrink-0 rounded px-1 py-px font-mono text-[10px] text-white" style={{ backgroundColor: project.color }}>
                          {project.projectNumber}
                        </span>
                      )}
                      <span className="truncate">
                        {project?.customer} · {users.find((u) => u.id === r.requestedBy)?.name ?? '—'}
                        {r.neededBy && ` · ${t('process.req.neededBy')} ${formatDate(r.neededBy)}`}
                      </span>
                    </p>
                  </div>
                  <p className="min-w-0 truncate text-xs text-slate-600 dark:text-slate-400">
                    {sups.map((s) => pd.suppliersById.get(s)?.name).filter(Boolean).join(', ') || '—'}
                    <span className="block text-slate-400">{t('process.req.itemsProgress', { ordered, total: r.items.length, received })}</span>
                  </p>
                  <div className="flex items-center gap-2 sm:flex-col sm:items-end sm:gap-1">
                    <StatusBadge kind="requisitionStatus" value={status} />
                    <StageStepper status={status} compact />
                  </div>
                </button>
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}

/** Recebimentos pendentes (GR) e últimos GRs registrados. */
export function ReceivingTab() {
  const { t } = useI18n();
  const allowed = useCan();
  const pd = usePurchasingData();
  const users = useCollection('users');
  const [grPo, setGrPo] = useState<string>();

  const pending = pd.purchaseOrders
    .filter((p) => p.kind === 'purchase' && p.status !== 'canceled')
    .map((po) => ({ po, lines: po.lines.filter((l) => l.status !== 'canceled' && openQty(l) > 0) }))
    .filter((x) => x.lines.length)
    .sort((a, b) => a.lines.map((l) => l.expectedDeliveryDate).sort()[0]!.localeCompare(b.lines.map((l) => l.expectedDeliveryDate).sort()[0]!));

  const projectsFor = (poId: string, lineId: string) =>
    pd.projects.filter((p) => p.materials.some((m) => m.poId === poId && m.poLineId === lineId)).map((p) => p.projectNumber);

  const log = pd.purchaseOrders
    .flatMap((po) => po.lines.flatMap((l) => (l.receipts ?? []).map((r) => ({ po, l, r }))))
    .sort((a, b) => b.r.date.localeCompare(a.r.date) || b.r.grNumber.localeCompare(a.r.grNumber))
    .slice(0, 15);

  return (
    <div className="space-y-6">
      <p className="text-sm text-slate-500">{t('process.receiving.hint')}</p>
      {pending.length === 0 ? (
        <div className="card">
          <EmptyState icon={PackageCheck} title={t('process.receiving.empty')} />
        </div>
      ) : (
        <div className="grid gap-4 xl:grid-cols-2">
          {pending.map(({ po, lines }) => (
            <article key={po.id} className="card overflow-hidden">
              <header className="flex items-center gap-3 border-b border-slate-200 p-4 dark:border-slate-800">
                <div className="min-w-0 flex-1">
                  <p className="font-mono font-semibold">PO {po.poNumber}</p>
                  <p className="truncate text-sm text-slate-500">{po.customerOrVendor}</p>
                </div>
                {allowed('gr.register') && (
                  <Button variant="primary" size="sm" icon={PackageCheck} onClick={() => setGrPo(po.id)}>
                    {t('process.gr.button')}
                  </Button>
                )}
              </header>
              <ul className="divide-y divide-slate-100 dark:divide-slate-800">
                {lines.map((l) => {
                  const late = l.expectedDeliveryDate < pd.today;
                  const prjs = projectsFor(po.id, l.id);
                  return (
                    <li key={l.id} className={cn('flex items-start gap-3 px-4 py-2.5 text-sm', late && 'bg-red-50/60 dark:bg-red-950/20')}>
                      <div className="min-w-0 flex-1">
                        <p className="font-medium">{l.description}</p>
                        <p className="text-xs text-slate-500">
                          <span className="font-mono">{l.partNumber}</span> · {t('process.receiving.openQty', { qty: openQty(l) })} ({receivedQty(l)}/{l.quantity})
                          {prjs.length > 0 && ` · ${t('process.receiving.projects', { list: prjs.join(', ') })}`}
                        </p>
                      </div>
                      <span className={cn('text-xs whitespace-nowrap', late ? 'font-semibold text-red-600' : 'text-slate-500')}>
                        {late && <AlertTriangle className="mr-1 inline size-3.5" />}
                        {t('process.receiving.expected', { date: formatDate(l.expectedDeliveryDate) })}
                      </span>
                    </li>
                  );
                })}
              </ul>
            </article>
          ))}
        </div>
      )}

      <section className="card overflow-hidden">
        <h3 className="border-b border-slate-200 px-4 py-3 font-semibold dark:border-slate-800">{t('process.receiving.log')}</h3>
        {log.length === 0 ? (
          <p className="p-4 text-sm text-slate-500">{t('process.receiving.noLog')}</p>
        ) : (
          <ul className="divide-y divide-slate-100 text-sm dark:divide-slate-800">
            {log.map(({ po, l, r }) => (
              <li key={r.id} className="flex flex-wrap items-center gap-3 px-4 py-2">
                <Badge tone="green">GR {r.grNumber}</Badge>
                <span className="w-24 text-xs text-slate-500">{formatDate(r.date)}</span>
                <span className="font-mono text-xs">PO {po.poNumber}</span>
                <span className="min-w-0 flex-1 truncate">
                  {l.description} × {r.quantity}
                </span>
                <span className="text-xs text-slate-500">{t('process.gr.by', { user: users.find((u) => u.id === r.receivedBy)?.name ?? '—' })}</span>
              </li>
            ))}
          </ul>
        )}
      </section>

      <GRDrawer open={!!grPo} poId={grPo} onClose={() => setGrPo(undefined)} />
    </div>
  );
}
