import { useMemo, useState } from 'react';
import { AlertTriangle, FileInput, PackageCheck } from 'lucide-react';
import { useCan } from '@/app/session';
import { Badge, StatusBadge } from '@/components/ui/Badge';
import { Button } from '@/components/ui/Button';
import { EmptyState } from '@/components/ui/misc';
import { useCollection } from '@/data/hooks';
import { effectiveStatus, needsLogistics, openQty, receivedQty, requisitionItemViews } from '@/domain/requisitions';
import { useI18n } from '@/i18n';
import { cn } from '@/lib/cn';
import { formatDate } from '@/lib/format';
import { usePurchasingData } from '../usePurchasingData';
import { GRDrawer } from './GRDrawer';
import { RequisitionDrawer } from './RequisitionDrawer';

/** Fila de requisições de compra (Office cria · Logística processa). */
export function RequisitionsTab({ openId, onOpenChange }: { openId?: string; onOpenChange: (id?: string) => void }) {
  const { t } = useI18n();
  const pd = usePurchasingData();
  const requisitions = useCollection('requisitions');
  const users = useCollection('users');
  const [filter, setFilter] = useState<'open' | 'all'>('open');

  const rows = useMemo(
    () =>
      requisitions
        .map((r) => {
          const project = pd.projects.find((p) => p.id === r.projectId);
          const views = requisitionItemViews(r, project, pd.poById);
          return { r, project, views, status: effectiveStatus(r, views) };
        })
        .filter((x) => filter === 'all' || !['received', 'rejected', 'canceled'].includes(x.status))
        .sort((a, b) => Number(needsLogistics(b.status)) - Number(needsLogistics(a.status)) || b.r.requestedAt.localeCompare(a.r.requestedAt)),
    [requisitions, pd, filter],
  );

  return (
    <div className="card overflow-hidden">
      <div className="flex gap-1 border-b border-slate-200 p-4 dark:border-slate-800">
        {(['open', 'all'] as const).map((f) => (
          <button
            key={f}
            onClick={() => setFilter(f)}
            aria-pressed={filter === f}
            className={cn('rounded-full border px-3 py-1 text-xs font-medium', filter === f ? 'border-slate-900 bg-slate-900 text-white dark:border-white dark:bg-white dark:text-slate-900' : 'border-slate-300 text-slate-600 dark:border-slate-700 dark:text-slate-400')}
          >
            {f === 'open' ? t('process.req.filterOpen') : t('process.req.filterAll')}
          </button>
        ))}
      </div>
      {rows.length === 0 ? (
        <EmptyState icon={FileInput} title={t('process.req.empty')} />
      ) : (
        <div className="overflow-x-auto">
          <table className="w-full min-w-[760px]">
            <thead className="bg-slate-50 dark:bg-slate-800/50">
              <tr>
                <th className="th">{t('process.req.number')}</th>
                <th className="th">{t('process.req.project')}</th>
                <th className="th">{t('process.req.requestedBy')}</th>
                <th className="th">{t('process.req.neededBy')}</th>
                <th className="th">{t('process.req.items')}</th>
                <th className="th">{t('common.status')}</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100 dark:divide-slate-800">
              {rows.map(({ r, project, views, status }) => {
                const ordered = views.filter((v) => v.status === 'ordered' || v.status === 'received').length;
                const received = views.filter((v) => v.status === 'received').length;
                return (
                  <tr key={r.id} onClick={() => onOpenChange(r.id)} className={cn('cursor-pointer hover:bg-slate-50 dark:hover:bg-slate-800/40', needsLogistics(status) && 'bg-blue-50/40 dark:bg-blue-950/10')}>
                    <td className="td">
                      <p className="font-mono font-semibold">{r.number}</p>
                      <p className="text-xs text-slate-500">{formatDate(r.requestedAt)}</p>
                    </td>
                    <td className="td">
                      {project && (
                        <>
                          <span className="rounded px-1.5 py-0.5 font-mono text-[10px] text-white" style={{ backgroundColor: project.color }}>
                            {project.projectNumber}
                          </span>
                          <p className="mt-0.5 text-sm">{project.customer}</p>
                        </>
                      )}
                    </td>
                    <td className="td text-sm">{users.find((u) => u.id === r.requestedBy)?.name ?? '—'}</td>
                    <td className="td text-sm">{formatDate(r.neededBy)}</td>
                    <td className="td text-xs">
                      <p className="font-medium">{t('process.req.itemsCount', { count: r.items.length })}</p>
                      <p className="text-slate-500">{t('process.req.itemsProgress', { ordered, total: r.items.length, received })}</p>
                    </td>
                    <td className="td">
                      <StatusBadge kind="requisitionStatus" value={status} />
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
      <RequisitionDrawer open={!!openId} requisitionId={openId} onClose={() => onOpenChange(undefined)} />
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
