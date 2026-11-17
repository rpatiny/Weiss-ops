import { useEffect, useMemo, useState, type FormEvent } from 'react';
import { ArrowLeft, Ban, Check, ExternalLink, FileCheck2, Mail, MessageSquare, PackageCheck, Pencil, Send, Star, XCircle } from 'lucide-react';
import { navigate } from '@/app/router';
import { useCan } from '@/app/session';
import { Badge, StatusBadge } from '@/components/ui/Badge';
import { Button } from '@/components/ui/Button';
import { Input, Select } from '@/components/ui/Field';
import { useToast } from '@/components/ui/Toast';
import { useCollection } from '@/data/hooks';
import { lastPurchase } from '@/domain/purchasing';
import { bestQuote, effectiveStatus, openQty, receivedQty, requisitionItemViews, requisitionService, rfqMailto, stageOf, STAGES, unseenPOEvents, unseenRejection } from '@/domain/requisitions';
import { useI18n } from '@/i18n';
import type { TranslationKey } from '@/i18n/types';
import { cn } from '@/lib/cn';
import { APP_CONFIG } from '@/lib/config';
import { formatCurrency, formatDate } from '@/lib/format';
import { PlantBadge } from '@/modules/extensions/PlantBadge';
import type { PurchaseRequisition, RequisitionItem, RequisitionStatus } from '@/types/models';
import { usePurchasingData } from '../usePurchasingData';
import { GRDrawer } from './GRDrawer';
import { RegisterPODrawer } from './RegisterPODrawer';

/** Etapas ①–⑤ do pedido; "encerrado" (recusado/cancelado) aparece como faixa vermelha. */
export function StageStepper({ status, compact }: { status: RequisitionStatus; compact?: boolean }) {
  const { t } = useI18n();
  const stage = stageOf(status);
  const idx = stage === 'closed' ? -1 : STAGES.indexOf(stage);
  // Recebido = última etapa concluída (não "em andamento").
  const doneUpTo = stage === 'received' ? STAGES.length : idx;
  if (compact)
    return (
      <span className="inline-flex items-center gap-0.5" title={stage === 'closed' ? t('process.stages.closed') : t(`process.stages.${stage}`)}>
        {STAGES.map((s, i) => (
          <span key={s} className={cn('h-1.5 w-4 rounded-full', stage === 'closed' ? 'bg-slate-300 dark:bg-slate-700' : i < doneUpTo ? 'bg-green-500' : i === idx ? 'bg-blue-500' : 'bg-slate-200 dark:bg-slate-700')} />
        ))}
      </span>
    );
  return (
    <ol className="grid grid-cols-5 gap-1 sm:gap-2">
      {STAGES.map((s, i) => {
        const done = i < doneUpTo;
        const current = i === idx && !done;
        return (
          <li key={s} className="min-w-0">
            <div className={cn('h-1.5 rounded-full', stage === 'closed' ? 'bg-slate-200 dark:bg-slate-800' : done ? 'bg-green-500' : current ? 'bg-blue-500' : 'bg-slate-200 dark:bg-slate-800')} />
            <p className={cn('mt-1.5 flex items-center gap-1 text-[11px] leading-tight font-medium sm:text-xs', current ? 'text-slate-900 dark:text-white' : done ? 'text-green-700 dark:text-green-400' : 'text-slate-400')}>
              <span className={cn('grid size-4 shrink-0 place-items-center rounded-full text-[10px] font-bold', done ? 'bg-green-500 text-white' : current ? 'bg-blue-500 text-white' : 'bg-slate-200 text-slate-500 dark:bg-slate-800')}>
                {done ? <Check className="size-3" /> : i + 1}
              </span>
              <span className="truncate">{t(`process.stages.${s}`)}</span>
            </p>
          </li>
        );
      })}
    </ol>
  );
}

/**
 * Tela inteira de um pedido de compra (`#/purchase-orders?req=<id>`): etapas, fornecedores e RFQ por e-mail,
 * cotações por item (melhor preço, escolhido), registro da PO do SAP pelo fornecedor escolhido, GR, histórico.
 */
export function RequisitionPage({ requisitionId, onBack }: { requisitionId: string; onBack: () => void }) {
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
  const canProcess = allowed('requisition.process');

  const [registerFor, setRegisterFor] = useState<{ supplierId?: string } | null>(null);
  const [grPo, setGrPo] = useState<string>();
  const [comment, setComment] = useState('');
  const [reasonFor, setReasonFor] = useState<'reject' | 'cancel' | null>(null);
  const [reason, setReason] = useState('');
  const [reasonError, setReasonError] = useState(false);

  // Quem pediu abriu o pedido: apaga as novidades (PO criada / recusada).
  const unseen = pr ? unseenPOEvents(pr).length + Number(unseenRejection(pr)) : 0;
  useEffect(() => {
    if (pr && unseen > 0) requisitionService.markSeenByRequester(pr.id);
  }, [pr, unseen]);
  useEffect(() => {
    window.scrollTo({ top: 0 });
  }, [requisitionId]);

  if (!pr) return null;
  const stage = stageOf(status);
  const closed = status === 'rejected' || status === 'canceled' || status === 'received';
  const anyOrdered = views.some((v) => v.status === 'ordered' || v.status === 'received');
  const isPending = (i: number) => views[i]?.status === 'requested' || views[i]?.status === 'to_buy';
  const userName = (id: string) => users.find((u) => u.id === id)?.name ?? '—';
  const supName = (id: string) => pd.suppliersById.get(id)?.name ?? '—';

  // Fornecedores do pedido (todos os itens) para o RFQ.
  const supplierIds = [...new Set(pr.items.flatMap((it) => (it.suppliers ?? []).map((s) => s.supplierId)))];
  // PO por fornecedor escolhido (só itens ainda sem PO).
  const pendingByChosen = new Map<string, RequisitionItem[]>();
  let withoutChoice = 0;
  pr.items.forEach((it, i) => {
    if (!isPending(i)) return;
    if (it.chosenSupplierId) pendingByChosen.set(it.chosenSupplierId, [...(pendingByChosen.get(it.chosenSupplierId) ?? []), it]);
    else withoutChoice++;
  });
  // POs ligadas ao pedido com quantidade em aberto (GR).
  const linkedPOs = [...new Map(views.filter((v) => v.po).map((v) => [v.po!.id, v.po!])).values()];

  const nextKey: TranslationKey = !canProcess && !closed ? 'process.page.next_office' : stage === 'closed' ? 'process.page.next_closed' : `process.page.next_${stage}`;

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
    <div className="space-y-5">
      <button type="button" onClick={onBack} className="inline-flex items-center gap-1.5 text-sm font-medium text-slate-600 hover:text-slate-900 dark:text-slate-400 dark:hover:text-white">
        <ArrowLeft className="size-4" /> {t('process.page.back')}
      </button>

      {/* Cabeçalho + etapas */}
      <section className="card space-y-4 p-4 sm:p-5">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div className="min-w-0">
            <h1 className="flex flex-wrap items-center gap-2 text-xl font-bold text-slate-900 dark:text-white">
              <span className="font-mono">{pr.number}</span> <StatusBadge kind="requisitionStatus" value={status} />
            </h1>
            {project && (
              <button type="button" onClick={() => navigate('/calendar', { open: project.id })} className="mt-1 inline-flex items-center gap-1.5 text-sm text-slate-600 hover:underline dark:text-slate-300">
                <span className="rounded px-1.5 py-0.5 font-mono text-[11px] text-white" style={{ backgroundColor: project.color }}>
                  {project.projectNumber}
                </span>
                {project.customer}
                <ExternalLink className="size-3.5" />
              </button>
            )}
          </div>
          <dl className="grid grid-cols-3 gap-x-5 gap-y-1 text-sm">
            <div>
              <dt className="text-xs text-slate-500">{t('process.req.requestedBy')}</dt>
              <dd className="font-medium">{userName(pr.requestedBy)}</dd>
            </div>
            <div>
              <dt className="text-xs text-slate-500">{t('process.page.requestedOn')}</dt>
              <dd className="font-medium">{formatDate(pr.requestedAt)}</dd>
            </div>
            <div>
              <dt className="text-xs text-slate-500">{t('process.req.neededBy')}</dt>
              <dd className="font-medium">{formatDate(pr.neededBy)}</dd>
            </div>
          </dl>
        </div>
        <StageStepper status={status} />
        <p className={cn('rounded-lg px-3 py-2 text-sm', stage === 'closed' ? 'bg-red-50 text-red-800 dark:bg-red-950/30 dark:text-red-300' : 'bg-blue-50 text-blue-900 dark:bg-blue-950/30 dark:text-blue-200')}>
          <strong>{t('process.page.next')}:</strong> {t(nextKey)}
        </p>
        {pr.notes && <p className="rounded-lg bg-slate-50 p-3 text-sm whitespace-pre-line dark:bg-slate-800/50">{pr.notes}</p>}
      </section>

      <div className="grid gap-5 lg:grid-cols-[minmax(0,1fr)_20rem]">
        <div className="min-w-0 space-y-5">
          {/* Fornecedores & RFQ */}
          {canProcess && !closed && supplierIds.length > 0 && pr.items.some((_, i) => isPending(i)) && (
            <section className="card p-4 sm:p-5">
              <h2 className="font-semibold">{t('process.page.suppliers')}</h2>
              <p className="mb-3 text-xs text-slate-500">{t('process.page.suppliersHint')}</p>
              <ul className="divide-y divide-slate-100 dark:divide-slate-800">
                {supplierIds.map((sid) => {
                  const sup = pd.suppliersById.get(sid);
                  const its = pr.items.filter((it) => (it.suppliers ?? []).some((s) => s.supplierId === sid));
                  const sent = its.map((it) => it.suppliers!.find((s) => s.supplierId === sid)!.rfqSentAt).filter(Boolean).sort().at(-1);
                  return (
                    <li key={sid} className="flex flex-wrap items-center gap-x-3 gap-y-2 py-2.5">
                      <div className="min-w-0 basis-full sm:basis-auto sm:flex-1">
                        <p className="font-medium">{sup?.name ?? '—'}</p>
                        <p className="truncate text-xs text-slate-500">
                          {sup?.email || t('process.page.noEmail')} · {t('process.page.itemsFor', { count: its.length })}
                        </p>
                      </div>
                      {sent && (
                        <Badge tone="blue">
                          <Mail className="size-3" /> {t('process.page.rfqSentOn', { date: formatDate(sent) })}
                        </Badge>
                      )}
                      <a
                        href={rfqMailto(pr, sid)}
                        onClick={() => requisitionService.markRfqSent(pr.id, sid)}
                        className={cn('inline-flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-sm font-medium', sent ? 'border border-slate-300 text-slate-700 hover:bg-slate-50 dark:border-slate-700 dark:text-slate-200 dark:hover:bg-slate-800' : 'bg-slate-900 text-white hover:bg-slate-800 dark:bg-white dark:text-slate-900')}
                      >
                        <Mail className="size-4" /> {sent ? t('process.page.resendRfq') : t('process.page.sendRfq')}
                      </a>
                    </li>
                  );
                })}
              </ul>
            </section>
          )}

          {/* Cotações por item */}
          <section className="space-y-3">
            <h2 className="font-semibold">{t('process.page.quotes')}</h2>
            {pr.items.map((it, i) => (
              <ItemQuotes key={it.id} pr={pr} item={it} view={views[i]} editable={canProcess && !closed && isPending(i)} />
            ))}
          </section>
        </div>

        <aside className="min-w-0 space-y-5">
          {/* PO */}
          {canProcess && !closed && (pendingByChosen.size > 0 || withoutChoice > 0) && (
            <section className="card space-y-2 p-4">
              <h2 className="font-semibold">{t('process.page.poSection')}</h2>
              {[...pendingByChosen.entries()].map(([sid, its]) => {
                const value = its.reduce((s, it) => s + (it.suppliers?.find((q) => q.supplierId === sid)?.price ?? 0) * it.quantity, 0);
                return (
                  <button
                    key={sid}
                    type="button"
                    onClick={() => setRegisterFor({ supplierId: sid })}
                    className="flex w-full items-center gap-2 rounded-lg bg-slate-900 px-3 py-2.5 text-left text-white hover:bg-slate-800 dark:bg-white dark:text-slate-900 dark:hover:bg-slate-200"
                  >
                    <FileCheck2 className="size-4 shrink-0" />
                    <span className="min-w-0">
                      <span className="block truncate text-sm font-semibold">{t('process.page.registerFor', { supplier: supName(sid) })}</span>
                      <span className="block text-xs opacity-75">{t('process.page.itemsReady', { count: its.length, value: formatCurrency(value) })}</span>
                    </span>
                  </button>
                );
              })}
              {withoutChoice > 0 && (
                <>
                  <p className="text-xs text-amber-700 dark:text-amber-400">{t('process.page.noChoice', { count: withoutChoice })}</p>
                  <Button size="sm" icon={FileCheck2} className="w-full justify-center" onClick={() => setRegisterFor({})}>
                    {t('process.page.registerOther')}
                  </Button>
                </>
              )}
            </section>
          )}

          {/* Entregas / GR */}
          {linkedPOs.length > 0 && (
            <section className="card space-y-2 p-4">
              <h2 className="font-semibold">{t('process.page.deliveries')}</h2>
              {linkedPOs.map((po) => {
                const lines = po.lines.filter((l) => views.some((v) => v.line?.id === l.id));
                const open = lines.reduce((s, l) => s + openQty(l), 0);
                const qty = lines.reduce((s, l) => s + l.quantity, 0);
                const next = lines.filter((l) => openQty(l) > 0).map((l) => l.expectedDeliveryDate).sort()[0];
                return (
                  <div key={po.id} className="rounded-lg border border-slate-200 p-3 text-sm dark:border-slate-800">
                    <button type="button" onClick={() => navigate('/purchase-orders', { open: po.id })} className="font-mono font-semibold text-brand-700 hover:underline dark:text-brand-400">
                      PO {po.poNumber}
                    </button>
                    <p className="text-xs text-slate-500">{po.customerOrVendor}</p>
                    <p className="mt-1 text-xs">
                      {open > 0 ? t('process.page.openOf', { open, qty }) : <span className="font-medium text-green-700 dark:text-green-400">✓ {t('enums.materialStatus.received')}</span>}
                      {next && <span className={cn('ml-1', next < pd.today ? 'font-semibold text-red-600' : 'text-slate-500')}>· {t('process.page.expected', { date: formatDate(next) })}</span>}
                    </p>
                    {open > 0 && canProcess && (
                      <Button size="sm" icon={PackageCheck} className="mt-2" onClick={() => setGrPo(po.id)}>
                        {t('process.gr.button')}
                      </Button>
                    )}
                  </div>
                );
              })}
            </section>
          )}

          {/* Recusar / cancelar */}
          {!closed && !anyOrdered && (canProcess || allowed('requisition.create')) && (
            <section className="flex flex-wrap gap-2">
              {canProcess && (
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

          {/* Histórico + comentários */}
          <section className="card p-4">
            <h2 className="mb-3 font-semibold">{t('process.req.history')}</h2>
            {(allowed('requisition.create') || canProcess) && (
              <form
                className="mb-4 flex gap-2"
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
            <ol className="relative space-y-3 border-l border-slate-200 pl-4 dark:border-slate-700">
              {[...pr.history].reverse().map((h, i) => (
                <li key={i} className="text-sm">
                  <span className="absolute -left-1.5 mt-1.5 size-3 rounded-full border-2 border-white bg-brand-500 dark:border-slate-900" />
                  <p>
                    <strong>{userName(h.userId)}</strong> {t(`process.req.events.${h.action}`)}
                  </p>
                  {h.note && <p className="break-words text-slate-600 dark:text-slate-400">{h.note}</p>}
                  <p className="text-xs text-slate-500">{new Date(h.at).toLocaleString(undefined, { dateStyle: 'short', timeStyle: 'short' })}</p>
                </li>
              ))}
            </ol>
          </section>
        </aside>
      </div>

      <RegisterPODrawer open={!!registerFor} requisitionId={pr.id} presetSupplierId={registerFor?.supplierId} onClose={() => setRegisterFor(null)} />
      <GRDrawer open={!!grPo} poId={grPo} onClose={() => setGrPo(undefined)} />
    </div>
  );
}

/** Um item do pedido × seus fornecedores: status do RFQ, cotação (preço/prazo/validade), melhor preço e escolhido. */
function ItemQuotes({ pr, item: it, view, editable }: { pr: PurchaseRequisition; item: RequisitionItem; view?: ReturnType<typeof requisitionItemViews>[number]; editable: boolean }) {
  const { t } = useI18n();
  const toast = useToast();
  const pd = usePurchasingData();
  const [editing, setEditing] = useState<string>();
  const [adding, setAdding] = useState('');
  const best = bestQuote(it);
  const last = lastPurchase(it.partNumber, pd.purchaseOrders);
  const rows = it.suppliers ?? [];
  const others = pd.suppliers.filter((s) => !rows.some((r) => r.supplierId === s.id));

  return (
    <article className="card overflow-hidden">
      <header className="flex flex-wrap items-start gap-3 border-b border-slate-100 p-4 dark:border-slate-800">
        <div className="min-w-0 flex-1">
          <p className="font-semibold text-slate-900 dark:text-white">
            {it.description} <span className="font-normal text-slate-500">× {it.quantity}</span>
          </p>
          <p className="flex flex-wrap items-center gap-2 text-xs text-slate-500">
            {it.partNumber && <span className="font-mono">{it.partNumber}</span>}
            {last && <span>{t('process.req.lastPaid', { price: formatCurrency(last.price) })}</span>}
            {editable && it.partNumber && <PlantBadge partNumber={it.partNumber} prefill={{ description: it.description, projectId: pr.projectId, neededBy: pr.neededBy }} />}
          </p>
        </div>
        <div className="flex flex-col items-end gap-1">
          {view && <StatusBadge kind="materialStatus" value={view.status} />}
          {view?.po && (
            <button type="button" onClick={() => navigate('/purchase-orders', { open: view.po!.id })} className="text-xs font-medium text-brand-700 hover:underline dark:text-brand-400">
              PO {view.po.poNumber}
              {view.line && ` · ${receivedQty(view.line)}/${view.line.quantity}`}
            </button>
          )}
        </div>
      </header>

      {rows.length === 0 ? (
        <p className="p-4 text-sm text-slate-500">{t('process.page.noSuppliers')}</p>
      ) : (
        <ul className="divide-y divide-slate-100 dark:divide-slate-800">
          {rows.map((q) => {
            const chosen = it.chosenSupplierId === q.supplierId;
            const isBest = best?.supplierId === q.supplierId && rows.filter((r) => r.price !== undefined).length > 1;
            return (
              <li key={q.supplierId} className={cn('p-3 sm:px-4', chosen && 'bg-green-50/70 dark:bg-green-950/20')}>
                <div className="flex flex-wrap items-center gap-x-4 gap-y-2">
                  <div className="min-w-[9rem] flex-1">
                    <p className="flex items-center gap-1.5 font-medium">
                      {pd.suppliersById.get(q.supplierId)?.name ?? '—'}
                      {chosen && (
                        <Badge tone="green">
                          <Check className="size-3" /> {t('process.page.chosen')}
                        </Badge>
                      )}
                      {isBest && (
                        <Badge tone="amber">
                          <Star className="size-3" /> {t('process.page.best')}
                        </Badge>
                      )}
                    </p>
                    {q.price === undefined && <p className="text-xs text-slate-500">{q.rfqSentAt ? t('process.page.awaiting', { date: formatDate(q.rfqSentAt) }) : t('process.page.notRequested')}</p>}
                  </div>
                  {q.price !== undefined && (
                    <div className="text-right">
                      <p className="text-lg font-bold tabular-nums text-slate-900 dark:text-white">
                        {formatCurrency(q.price)} <span className="text-xs font-normal text-slate-500">{t('process.page.perUnit')}</span>
                      </p>
                      <p className="text-xs text-slate-500">
                        {t('process.page.lineTotal', { value: formatCurrency(q.price * it.quantity) })}
                        {q.leadTimeDays !== undefined && ` · ${t('process.page.leadDays', { days: q.leadTimeDays })}`}
                        {q.validUntil && ` · ${t('process.page.validUntil', { date: formatDate(q.validUntil) })}`}
                        {q.quoteRef && ` · ${q.quoteRef}`}
                      </p>
                    </div>
                  )}
                  {editable && (
                    <div className="flex gap-1.5">
                      <Button size="sm" icon={Pencil} onClick={() => setEditing(editing === q.supplierId ? undefined : q.supplierId)}>
                        {q.price === undefined ? t('process.page.enterQuote') : t('process.page.editQuote')}
                      </Button>
                      {q.price !== undefined && !chosen && (
                        <Button
                          size="sm"
                          variant="primary"
                          icon={Check}
                          onClick={() => {
                            requisitionService.chooseSupplier(pr.id, it.id, q.supplierId);
                            toast.success(t('process.page.chosenToast', { supplier: pd.suppliersById.get(q.supplierId)?.name ?? '' }));
                          }}
                        >
                          {t('process.page.choose')}
                        </Button>
                      )}
                    </div>
                  )}
                </div>
                {editing === q.supplierId && (
                  <QuoteForm
                    initial={q}
                    onCancel={() => setEditing(undefined)}
                    onSave={(v) => {
                      requisitionService.recordQuote(pr.id, it.id, q.supplierId, v);
                      setEditing(undefined);
                      toast.success(t('process.page.quoteSaved'));
                    }}
                  />
                )}
              </li>
            );
          })}
        </ul>
      )}
      {editable && others.length > 0 && (
        <div className="border-t border-slate-100 p-3 sm:px-4 dark:border-slate-800">
          <Select
            className="sm:max-w-xs"
            value={adding}
            onChange={(v) => {
              if (!v) return;
              requisitionService.addSupplier(pr.id, it.id, v);
              setAdding('');
            }}
            options={[{ value: '', label: t('process.page.addSupplier') }, ...others.map((s) => ({ value: s.id, label: s.name }))]}
            aria-label={t('process.page.addSupplier')}
          />
        </div>
      )}
    </article>
  );
}

function QuoteForm({ initial, onSave, onCancel }: { initial: { price?: number; leadTimeDays?: number; validUntil?: string; quoteRef?: string }; onSave: (v: { price: number; leadTimeDays?: number; validUntil?: string; quoteRef?: string }) => void; onCancel: () => void }) {
  const { t } = useI18n();
  const [price, setPrice] = useState(initial.price?.toString() ?? '');
  const [lead, setLead] = useState(initial.leadTimeDays?.toString() ?? '');
  const [validUntil, setValidUntil] = useState(initial.validUntil ?? '');
  const [ref, setRef] = useState(initial.quoteRef ?? '');
  const [error, setError] = useState(false);
  const submit = (e: FormEvent) => {
    e.preventDefault();
    const p = Number(price);
    if (price === '' || !(p >= 0)) return setError(true);
    onSave({ price: p, leadTimeDays: lead === '' ? undefined : Number(lead), validUntil: validUntil || undefined, quoteRef: ref });
  };
  return (
    <form onSubmit={submit} className="animate-pop-in mt-3 grid gap-2 rounded-lg bg-slate-50 p-3 sm:grid-cols-[1fr_1fr_1fr_1fr_auto] dark:bg-slate-800/50" noValidate>
      <label className="text-xs text-slate-500">
        {t('process.form.unitPrice', { currency: APP_CONFIG.currency })}
        <Input type="number" min={0} step="0.01" value={price} onChange={(e) => { setPrice(e.target.value); setError(false); }} invalid={error} autoFocus />
      </label>
      <label className="text-xs text-slate-500">
        {t('process.form.leadTime')}
        <Input type="number" min={0} value={lead} onChange={(e) => setLead(e.target.value)} />
      </label>
      <label className="text-xs text-slate-500">
        {t('purchasing.materials.validUntilCol')}
        <Input type="date" value={validUntil} onChange={(e) => setValidUntil(e.target.value)} />
      </label>
      <label className="text-xs text-slate-500">
        {t('process.form.quoteRef')}
        <Input value={ref} onChange={(e) => setRef(e.target.value)} />
      </label>
      <div className="flex items-end gap-1.5">
        <Button size="sm" onClick={onCancel}>
          {t('common.cancel')}
        </Button>
        <Button size="sm" variant="primary" type="submit">
          {t('process.page.saveQuote')}
        </Button>
      </div>
      {error && <p className="text-xs text-red-600 sm:col-span-5">{t('process.validation.price')}</p>}
    </form>
  );
}
