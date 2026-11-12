import { useMemo, useState } from 'react';
import { Ban, ExternalLink, FileCheck2, MessageSquare, Search, Send, XCircle } from 'lucide-react';
import { navigate } from '@/app/router';
import { useCan } from '@/app/session';
import { StatusBadge } from '@/components/ui/Badge';
import { Button } from '@/components/ui/Button';
import { Drawer } from '@/components/ui/Drawer';
import { Input } from '@/components/ui/Field';
import { useToast } from '@/components/ui/Toast';
import { useCollection } from '@/data/hooks';
import { bestOffer, lastPurchase, normPN, offerViews, quoteState } from '@/domain/purchasing';
import { effectiveStatus, receivedQty, requisitionItemViews, requisitionService } from '@/domain/requisitions';
import { useI18n } from '@/i18n';
import { formatCurrency, formatDate } from '@/lib/format';
import { usePurchasingData } from '../usePurchasingData';
import { RegisterPODrawer } from './RegisterPODrawer';
import { PlantBadge } from '@/modules/extensions/PlantBadge';

interface Props {
  open: boolean;
  requisitionId?: string;
  onClose: () => void;
}

export function RequisitionDrawer({ open, requisitionId, onClose }: Props) {
  const { t } = useI18n();
  const toast = useToast();
  const allowed = useCan();
  const pd = usePurchasingData();
  const requisitions = useCollection('requisitions');
  const users = useCollection('users');
  const pr = requisitions.find((r) => r.id === requisitionId);
  const project = pr ? pd.projects.find((p) => p.id === pr.projectId) : undefined;
  const views = useMemo(() => (pr ? requisitionItemViews(pr, project, pd.poById) : []), [pr, project, pd.poById]);
  const status = pr ? effectiveStatus(pr, views) : 'submitted';

  const [comment, setComment] = useState('');
  const [reasonFor, setReasonFor] = useState<'reject' | 'cancel' | null>(null);
  const [reason, setReason] = useState('');
  const [reasonError, setReasonError] = useState(false);
  const [registering, setRegistering] = useState(false);

  if (!pr) return null;
  const closed = status === 'rejected' || status === 'canceled' || status === 'received';
  const anyOrdered = views.some((v) => v.status === 'ordered' || v.status === 'received');
  const pending = views.filter((v) => v.status === 'requested' || v.status === 'to_buy');
  const userName = (id: string) => users.find((u) => u.id === id)?.name ?? '—';

  const confirmReason = () => {
    if (!reason.trim()) return setReasonError(true);
    if (reasonFor === 'reject') {
      requisitionService.reject(pr.id, reason);
      toast.success(t('process.req.rejected'));
    } else {
      requisitionService.cancel(pr.id, reason);
      toast.success(t('process.req.canceled'));
    }
    setReasonFor(null);
    setReason('');
  };

  return (
    <>
      <Drawer
        open={open}
        onClose={onClose}
        width="xl"
        title={
          <span className="flex items-center gap-2">
            {t('process.req.title', { number: pr.number })} <StatusBadge kind="requisitionStatus" value={status} />
          </span>
        }
        subtitle={project ? `${project.projectNumber} · ${project.customer}` : undefined}
        footer={
          <>
            {project && (
              <Button variant="ghost" icon={ExternalLink} className="mr-auto" onClick={() => { onClose(); navigate('/calendar', { open: project.id }); }}>
                {t('process.req.openProject')}
              </Button>
            )}
            {!closed && allowed('requisition.process') && status === 'submitted' && (
              <Button icon={Search} onClick={() => { requisitionService.startQuoting(pr.id); toast.success(t('process.req.quotingStarted')); }}>
                {t('process.req.startQuoting')}
              </Button>
            )}
            {!closed && allowed('requisition.process') && pending.length > 0 && (
              <Button variant="primary" icon={FileCheck2} onClick={() => setRegistering(true)}>
                {t('process.req.registerPO')}
              </Button>
            )}
            <Button onClick={onClose}>{t('common.close')}</Button>
          </>
        }
      >
        <div className="space-y-6">
          <dl className="grid gap-4 text-sm sm:grid-cols-4">
            <div>
              <dt className="text-xs text-slate-500">{t('process.req.requestedBy')}</dt>
              <dd className="font-medium">{userName(pr.requestedBy)}</dd>
            </div>
            <div>
              <dt className="text-xs text-slate-500">{t('purchasing.orders.orderDate')}</dt>
              <dd className="font-medium">{formatDate(pr.requestedAt)}</dd>
            </div>
            <div>
              <dt className="text-xs text-slate-500">{t('process.req.neededBy')}</dt>
              <dd className="font-medium">{formatDate(pr.neededBy)}</dd>
            </div>
            <div>
              <dt className="text-xs text-slate-500">{t('process.req.items')}</dt>
              <dd className="font-medium">{t('process.req.itemsCount', { count: pr.items.length })}</dd>
            </div>
            {pr.notes && <dd className="rounded-lg bg-slate-50 p-3 whitespace-pre-line sm:col-span-4 dark:bg-slate-800/50">{pr.notes}</dd>}
          </dl>

          {/* Itens */}
          <section>
            <h3 className="mb-2 font-semibold">{t('process.req.items')}</h3>
            <ul className="divide-y divide-slate-100 rounded-lg border border-slate-200 dark:divide-slate-800 dark:border-slate-800">
              {pr.items.map((it, i) => {
                const v = views[i]!;
                const cat = pd.catalogByPN.get(normPN(it.partNumber));
                const best = cat ? bestOffer(offerViews(cat, pd.suppliersById, pd.purchaseOrders, pd.today)) : undefined;
                const last = lastPurchase(it.partNumber, pd.purchaseOrders);
                return (
                  <li key={it.id} className="flex flex-wrap items-start gap-3 p-3 text-sm">
                    <div className="min-w-0 flex-1">
                      <p className="font-medium">
                        {it.description} <span className="text-xs font-normal text-slate-500">× {it.quantity}</span>
                      </p>
                      <p className="font-mono text-xs text-slate-500">{it.partNumber}</p>
                      <p className="mt-1 flex flex-wrap items-center gap-2 text-xs text-slate-500">
                        <StatusBadge kind="quoteState" value={quoteState(cat, pd.today)} />
                        {best?.supplier && best.refPrice !== undefined && <span>{t('process.req.bestQuote', { supplier: best.supplier.name, price: formatCurrency(best.refPrice) })}</span>}
                        {last && <span>{t('process.req.lastPaid', { price: formatCurrency(last.price) })}</span>}
                        {(v.status === 'requested' || v.status === 'to_buy') && <PlantBadge partNumber={it.partNumber} prefill={{ description: it.description, projectId: pr.projectId, neededBy: pr.neededBy }} />}
                      </p>
                    </div>
                    <div className="flex flex-col items-end gap-1">
                      <StatusBadge kind="materialStatus" value={v.status} />
                      {v.po && (
                        <button type="button" onClick={() => { onClose(); navigate('/purchase-orders', { open: v.po!.id }); }} className="text-xs font-medium text-brand-700 hover:underline dark:text-brand-400">
                          PO {v.po.poNumber}
                          {v.line && ` · ${receivedQty(v.line)}/${v.line.quantity}`}
                        </button>
                      )}
                    </div>
                  </li>
                );
              })}
            </ul>
          </section>

          {/* Rejeitar / cancelar */}
          {!closed && !anyOrdered && (
            <section className="flex flex-wrap gap-2">
              {allowed('requisition.process') && (
                <Button size="sm" variant="ghost" icon={XCircle} className="text-red-600" onClick={() => setReasonFor('reject')}>
                  {t('process.req.reject')}
                </Button>
              )}
              {allowed('requisition.create') && (
                <Button size="sm" variant="ghost" icon={Ban} className="text-red-600" onClick={() => setReasonFor('cancel')}>
                  {t('process.req.cancel')}
                </Button>
              )}
            </section>
          )}
          {reasonFor && (
            <div className="animate-pop-in space-y-2 rounded-lg border border-red-300 bg-red-50/50 p-3 dark:border-red-900 dark:bg-red-950/20">
              <Input value={reason} onChange={(e) => { setReason(e.target.value); setReasonError(false); }} placeholder={t('process.req.reason')} invalid={reasonError} autoFocus aria-label={t('process.req.reason')} />
              {reasonError && <p className="text-xs text-red-600">{t('process.req.reasonRequired')}</p>}
              <div className="flex justify-end gap-2">
                <Button size="sm" onClick={() => setReasonFor(null)}>
                  {t('common.cancel')}
                </Button>
                <Button size="sm" variant="danger" onClick={confirmReason}>
                  {reasonFor === 'reject' ? t('process.req.reject') : t('process.req.cancel')}
                </Button>
              </div>
            </div>
          )}

          {/* Histórico */}
          <section>
            <h3 className="mb-2 font-semibold">{t('process.req.history')}</h3>
            <ol className="relative space-y-3 border-l border-slate-200 pl-4 dark:border-slate-700">
              {[...pr.history].reverse().map((h, i) => (
                <li key={i} className="text-sm">
                  <span className="absolute -left-1.5 mt-1.5 size-3 rounded-full border-2 border-white bg-brand-500 dark:border-slate-900" />
                  <p>
                    <strong>{userName(h.userId)}</strong> {t(`process.req.events.${h.action}`)}
                    <span className="ml-2 text-xs text-slate-500">{new Date(h.at).toLocaleString(undefined, { dateStyle: 'short', timeStyle: 'short' })}</span>
                  </p>
                  {h.note && <p className="text-slate-600 dark:text-slate-400">{h.note}</p>}
                </li>
              ))}
            </ol>
            {(allowed('requisition.create') || allowed('requisition.process')) && (
              <form
                className="mt-3 flex gap-2"
                onSubmit={(e) => {
                  e.preventDefault();
                  if (!comment.trim()) return;
                  requisitionService.comment(pr.id, comment.trim());
                  setComment('');
                  toast.success(t('process.req.commented'));
                }}
              >
                <Input value={comment} onChange={(e) => setComment(e.target.value)} placeholder={t('process.req.commentPlaceholder')} aria-label={t('process.req.comment')} />
                <Button type="submit" icon={comment.trim() ? Send : MessageSquare} aria-label={t('process.req.comment')} />
              </form>
            )}
          </section>
        </div>
      </Drawer>
      <RegisterPODrawer open={registering} requisitionId={pr.id} onClose={() => setRegistering(false)} />
    </>
  );
}
