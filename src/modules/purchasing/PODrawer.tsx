import { useEffect, useMemo, useState, type FormEvent } from 'react';
import { AlertTriangle, Cog, ExternalLink, FileInput, FolderKanban, Link as LinkIcon, PackageCheck, Plus, Save, Trash2 } from 'lucide-react';
import { useCan } from '@/app/session';
import { openQty } from '@/domain/requisitions';
import { navigate } from '@/app/router';
import { Badge, StatusBadge } from '@/components/ui/Badge';
import { Button } from '@/components/ui/Button';
import { Drawer } from '@/components/ui/Drawer';
import { Field, Input, Select, Textarea } from '@/components/ui/Field';
import { ConfirmDialog } from '@/components/ui/Modal';
import { useToast } from '@/components/ui/Toast';
import { useCollection } from '@/data/hooks';
import { enumOptions } from '@/domain/labels';
import {
  emptyLine,
  isLineLate,
  isQuoteValid,
  lastPurchase,
  lineTotal,
  nextPurchaseNumber,
  normPN,
  poService,
  poTotal,
  validatePO,
  type PODraft,
} from '@/domain/purchasing';
import { useI18n } from '@/i18n';
import { cn } from '@/lib/cn';
import { addDays, todayISO } from '@/lib/dates';
import { newId } from '@/lib/id';
import { formatCurrency, formatDate } from '@/lib/format';
import type { POLineItem, POKind } from '@/types/models';

interface Props {
  open: boolean;
  poId?: string;
  onClose: () => void;
  onRegisterGR?: (poId: string) => void;
}

const emptyPO = (number: string): PODraft => ({
  poNumber: number,
  kind: 'purchase',
  customerOrVendor: '',
  supplierId: '',
  orderDate: todayISO(),
  requester: '',
  paymentTerms: '28 DDL',
  status: 'open',
  notes: '',
  attachments: [],
  lines: [emptyLine(1)],
});

export function PODrawer({ open, poId, onClose, onRegisterGR }: Props) {
  const allowed = useCan();
  const readOnly = !allowed('po.edit');
  const users = useCollection('users');
  const requisitions = useCollection('requisitions');
  const { t } = useI18n();
  const toast = useToast();
  const purchaseOrders = useCollection('purchaseOrders');
  const suppliers = useCollection('suppliers');
  const catalog = useCollection('materials');
  const projects = useCollection('projects');
  const spindles = useCollection('spindles');
  const today = todayISO();

  const existing = purchaseOrders.find((p) => p.id === poId);
  const [draft, setDraft] = useState<PODraft>(emptyPO(''));
  const [errors, setErrors] = useState<ReturnType<typeof validatePO>>({});
  const [confirmDelete, setConfirmDelete] = useState(false);

  useEffect(() => {
    if (!open) return;
    setErrors({});
    if (existing) {
      const { id: _id, ...rest } = existing;
      setDraft({ ...rest, lines: rest.lines.map((l) => ({ ...l })), attachments: rest.attachments.map((a) => ({ ...a })) });
    } else setDraft(emptyPO(nextPurchaseNumber(purchaseOrders)));
  }, [open, poId]);

  const catByPN = useMemo(() => new Map(catalog.map((c) => [normPN(c.partNumber), c])), [catalog]);
  const customers = useMemo(
    () => [...new Set([...purchaseOrders.filter((p) => p.kind === 'sales').map((p) => p.customerOrVendor), ...spindles.map((s) => s.customer), ...projects.map((p) => p.customer)])].sort(),
    [purchaseOrders, spindles, projects],
  );

  const set = <K extends keyof PODraft>(k: K, v: PODraft[K]) => setDraft((d) => ({ ...d, [k]: v }));

  /** Preço sugerido p/ compra: cotação válida do fornecedor > último pago a ele. */
  const suggestedPrice = (pn: string) => {
    if (draft.kind !== 'purchase' || !draft.supplierId) return undefined;
    const offer = catByPN.get(normPN(pn))?.offers.find((o) => o.supplierId === draft.supplierId);
    if (offer && isQuoteValid(offer, today)) return offer.quotedPrice;
    return lastPurchase(pn, purchaseOrders, draft.supplierId)?.price;
  };

  const setLine = (id: string, patch: Partial<POLineItem>) =>
    setDraft((d) => ({
      ...d,
      lines: d.lines.map((l) => {
        if (l.id !== id) return l;
        const next = { ...l, ...patch };
        if (patch.partNumber !== undefined) {
          const cat = catByPN.get(normPN(patch.partNumber));
          if (cat && !l.description.trim()) next.description = cat.description;
          const price = suggestedPrice(patch.partNumber);
          if (price !== undefined && !l.unitPrice) next.unitPrice = price;
          const lead = cat?.offers.find((o) => o.supplierId === d.supplierId)?.leadTimeDays;
          if (lead !== undefined && d.kind === 'purchase') next.expectedDeliveryDate = addDays(d.orderDate || today, lead);
        }
        if (patch.status === 'delivered' && !next.actualDeliveryDate) next.actualDeliveryDate = today;
        return next;
      }),
    }));

  const addLine = () => setDraft((d) => ({ ...d, lines: [...d.lines, emptyLine(Math.max(0, ...d.lines.map((l) => l.lineNumber)) + 1)] }));
  const removeLine = (id: string) => setDraft((d) => ({ ...d, lines: d.lines.filter((l) => l.id !== id) }));

  const submit = (e: FormEvent) => {
    e.preventDefault();
    const errs = validatePO(draft, purchaseOrders, poId);
    setErrors(errs);
    if (Object.keys(errs).length) return;
    const saved = poService.save(draft, poId);
    toast.success(t(poId ? 'purchasing.po.updated' : 'purchasing.po.created', { number: saved.poNumber }));
    onClose();
  };

  const remove = () => {
    if (!poId) return;
    poService.remove(poId);
    toast.success(t('purchasing.po.deleted'));
    setConfirmDelete(false);
    onClose();
  };

  // Vínculos (relação inversa)
  const linkedProjects = poId
    ? projects
        .map((p) => ({ p, asCustomerPO: p.poId === poId, materials: p.materials.filter((m) => m.poId === poId) }))
        .filter((x) => x.asCustomerPO || x.materials.length)
    : [];
  const linkedSpindles = poId ? spindles.filter((s) => s.poId === poId) : [];

  const go = (path: '/calendar' | '/financial', id: string) => {
    onClose();
    navigate(path, { open: id });
  };

  return (
    <>
      <Drawer
        open={open}
        onClose={onClose}
        width="2xl"
        title={existing ? t('purchasing.po.editTitle', { number: existing.poNumber }) : t('purchasing.po.newTitle')}
        subtitle={existing ? existing.customerOrVendor : undefined}
        footer={
          <>
            {existing && !readOnly && (
              <Button variant="ghost" icon={Trash2} className="mr-auto text-red-600" onClick={() => setConfirmDelete(true)}>
                {t('common.delete')}
              </Button>
            )}
            {readOnly && <span className="mr-auto text-xs text-slate-500">{t('auth.readOnly')}</span>}
            {existing?.kind === 'purchase' && onRegisterGR && allowed('gr.register') && existing.lines.some((l) => l.status !== 'canceled' && openQty(l) > 0) && (
              <Button icon={PackageCheck} onClick={() => onRegisterGR(existing.id)}>
                {t('process.gr.button')}
              </Button>
            )}
            <Button onClick={onClose}>{readOnly ? t('common.close') : t('common.cancel')}</Button>
            {!readOnly && (
              <Button variant="primary" icon={Save} type="submit" form="po-form">
                {existing ? t('purchasing.po.submitSave') : t('purchasing.po.submitCreate')}
              </Button>
            )}
          </>
        }
      >
        <form id="po-form" onSubmit={submit} className="space-y-6" noValidate>
          {existing?.requisitionId && (
            <button type="button" onClick={() => { onClose(); navigate('/purchase-orders', { req: existing.requisitionId }); }} className="inline-flex items-center gap-1.5 rounded-lg border border-slate-200 px-3 py-1.5 text-sm hover:border-brand-500 dark:border-slate-700">
              <FileInput className="size-4 text-slate-500" /> {requisitions.find((r) => r.id === existing.requisitionId)?.number}
            </button>
          )}
          <fieldset disabled={readOnly} className="space-y-6">
          {/* Cabeçalho */}
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
            <Field label={t('purchasing.po.number')} required error={errors.poNumber && t(errors.poNumber)}>
              {(id) => <Input id={id} name="poNumber" value={draft.poNumber} onChange={(e) => set('poNumber', e.target.value)} className="font-mono" invalid={!!errors.poNumber} />}
            </Field>
            <Field label={t('purchasing.po.kind')}>
              {(id) => <Select<POKind> id={id} name="kind" value={draft.kind} onChange={(v) => setDraft((d) => ({ ...d, kind: v, supplierId: v === 'purchase' ? d.supplierId : undefined }))} options={enumOptions(t, 'poKind')} />}
            </Field>
            <Field label={draft.kind === 'purchase' ? t('purchasing.po.supplier') : t('purchasing.po.customer')} required error={errors.customerOrVendor && t(errors.customerOrVendor)} className="sm:col-span-2">
              {(id) =>
                draft.kind === 'purchase' ? (
                  <Select
                    id={id}
                    name="supplierId"
                    value={draft.supplierId ?? ''}
                    onChange={(v) => setDraft((d) => ({ ...d, supplierId: v || undefined, customerOrVendor: suppliers.find((s) => s.id === v)?.name ?? '' }))}
                    options={[{ value: '', label: t('purchasing.po.selectSupplier') }, ...[...suppliers].sort((a, b) => a.name.localeCompare(b.name)).map((s) => ({ value: s.id, label: s.name }))]}
                  />
                ) : (
                  <Input id={id} name="customer" value={draft.customerOrVendor} onChange={(e) => set('customerOrVendor', e.target.value)} list="po-customers" invalid={!!errors.customerOrVendor} />
                )
              }
            </Field>
            <datalist id="po-customers">
              {customers.map((c) => (
                <option key={c} value={c} />
              ))}
            </datalist>
            <Field label={t('purchasing.po.orderDate')} required error={errors.orderDate && t(errors.orderDate)}>
              {(id) => <Input id={id} type="date" value={draft.orderDate} onChange={(e) => set('orderDate', e.target.value)} />}
            </Field>
            <Field label={t('purchasing.po.requester')}>
              {(id) => <Input id={id} value={draft.requester} onChange={(e) => set('requester', e.target.value)} />}
            </Field>
            <Field label={t('purchasing.po.paymentTerms')}>
              {(id) => <Input id={id} value={draft.paymentTerms} onChange={(e) => set('paymentTerms', e.target.value)} />}
            </Field>
            <Field label={t('common.status')} hint={t('purchasing.po.statusAuto')}>
              {(id) => <Select id={id} value={draft.status} onChange={(v) => set('status', v)} options={enumOptions(t, 'poStatus')} />}
            </Field>
          </div>
          <Field label={t('purchasing.po.notes')}>
            {(id) => <Textarea id={id} rows={2} value={draft.notes} onChange={(e) => set('notes', e.target.value)} />}
          </Field>

          {/* Itens */}
          <section>
            <div className="mb-2 flex items-center justify-between">
              <h3 className="font-semibold">{t('purchasing.po.lines')}</h3>
              <Button size="sm" icon={Plus} onClick={addLine}>
                {t('purchasing.po.addLine')}
              </Button>
            </div>
            {errors.linesInvalid && (
              <p role="alert" className="mb-2 text-sm text-red-600">
                {t(errors.linesInvalid)}
              </p>
            )}
            <div className="overflow-x-auto rounded-lg border border-slate-200 dark:border-slate-800">
              <table className="w-full min-w-[1180px] table-fixed text-sm">
                <thead className="bg-slate-50 dark:bg-slate-800/50">
                  <tr>
                    <th className="th w-10">#</th>
                    <th className="th w-40">{t('purchasing.po.partNumber')}</th>
                    <th className="th w-auto">{t('purchasing.po.description')}</th>
                    <th className="th w-20 text-right">{t('purchasing.po.quantity')}</th>
                    <th className="th w-28 text-right">{t('purchasing.po.unitPrice')}</th>
                    <th className="th w-28 text-right">{t('purchasing.po.lineTotal')}</th>
                    <th className="th w-36">{t('purchasing.po.expected')}</th>
                    <th className="th w-36">{t('purchasing.po.actual')}</th>
                    <th className="th w-32">{t('common.status')}</th>
                    <th className="th w-10" />
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100 dark:divide-slate-800">
                  {draft.lines.map((l) => {
                    const late = isLineLate(l, today);
                    const last = l.partNumber ? lastPurchase(l.partNumber, purchaseOrders.filter((p) => p.id !== poId)) : undefined;
                    return (
                      <tr key={l.id} className={cn(late && 'bg-red-50 dark:bg-red-950/30')}>
                        <td className={cn('td font-mono text-xs', late && 'text-red-700 dark:text-red-400')}>{l.lineNumber}</td>
                        <td className="td">
                          <Input value={l.partNumber} onChange={(e) => setLine(l.id, { partNumber: e.target.value })} className="font-mono text-xs" list="catalog-pns" aria-label={t('purchasing.po.partNumber')} />
                        </td>
                        <td className="td">
                          <Input value={l.description} onChange={(e) => setLine(l.id, { description: e.target.value })} aria-label={t('purchasing.po.description')} invalid={!!errors.linesInvalid && !l.description.trim()} />
                          {late && (
                            <Badge tone="red" className="mt-1">
                              <AlertTriangle className="size-3" /> {t('purchasing.po.late')}
                            </Badge>
                          )}
                          {(l.receipts ?? []).map((r) => (
                            <p key={r.id} className="mt-1 text-[10px] text-green-700 dark:text-green-400">
                              GR {r.grNumber} · {formatDate(r.date)} · ×{r.quantity} · {users.find((u) => u.id === r.receivedBy)?.name ?? ''}
                            </p>
                          ))}
                        </td>
                        <td className="td">
                          <Input type="number" min={0} step="any" value={l.quantity} onChange={(e) => setLine(l.id, { quantity: Number(e.target.value) })} className="text-right" aria-label={t('purchasing.po.quantity')} />
                        </td>
                        <td className="td">
                          <Input type="number" min={0} step="0.01" value={l.unitPrice} onChange={(e) => setLine(l.id, { unitPrice: Number(e.target.value) })} className="text-right" aria-label={t('purchasing.po.unitPrice')} />
                          {last && <p className="mt-1 text-right text-[10px] text-slate-500">{t('purchasing.po.lastPrice', { price: formatCurrency(last.price), date: formatDate(last.date) })}</p>}
                        </td>
                        <td className="td text-right font-medium tabular-nums">{formatCurrency(lineTotal(l))}</td>
                        <td className="td">
                          <Input type="date" value={l.expectedDeliveryDate} onChange={(e) => setLine(l.id, { expectedDeliveryDate: e.target.value })} className={cn(late && 'border-red-500 text-red-700 dark:text-red-400')} aria-label={t('purchasing.po.expected')} />
                        </td>
                        <td className="td">
                          <Input type="date" value={l.actualDeliveryDate ?? ''} onChange={(e) => setLine(l.id, { actualDeliveryDate: e.target.value || undefined })} aria-label={t('purchasing.po.actual')} />
                        </td>
                        <td className="td">
                          <Select value={l.status} onChange={(v) => setLine(l.id, { status: v })} options={enumOptions(t, 'poLineStatus')} aria-label={t('common.status')} />
                        </td>
                        <td className="td">
                          <Button size="sm" variant="ghost" icon={Trash2} className="text-red-600" onClick={() => removeLine(l.id)} aria-label={t('purchasing.po.removeLine')} title={t('purchasing.po.removeLine')} />
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
                <tfoot>
                  <tr className="bg-slate-50 font-semibold dark:bg-slate-800/50">
                    <td className="td" colSpan={5}>
                      {t('purchasing.po.grandTotal')}
                    </td>
                    <td className="td text-right text-base tabular-nums">{formatCurrency(poTotal(draft))}</td>
                    <td colSpan={4} />
                  </tr>
                </tfoot>
              </table>
            </div>
            <datalist id="catalog-pns">
              {catalog.map((c) => (
                <option key={c.id} value={c.partNumber}>
                  {c.description}
                </option>
              ))}
            </datalist>
          </section>

          {/* Anexos */}
          <section>
            <div className="mb-2 flex items-center justify-between">
              <h3 className="font-semibold">{t('purchasing.po.attachments')}</h3>
              <Button size="sm" icon={Plus} onClick={() => set('attachments', [...draft.attachments, { id: newId('att'), name: '', url: '', type: draft.kind === 'sales' ? 'po_pdf' : 'other' }])}>
                {t('purchasing.po.addAttachment')}
              </Button>
            </div>
            {draft.attachments.length === 0 ? (
              <p className="text-sm text-slate-500">{t('purchasing.po.noAttachments')}</p>
            ) : (
              <ul className="space-y-2">
                {draft.attachments.map((a) => (
                  <li key={a.id} className="grid gap-2 sm:grid-cols-[160px_1fr_2fr_auto_auto]">
                    <Select value={a.type} onChange={(v) => set('attachments', draft.attachments.map((x) => (x.id === a.id ? { ...x, type: v } : x)))} options={enumOptions(t, 'attachmentType')} aria-label={t('purchasing.po.kind')} />
                    <Input value={a.name} placeholder={t('purchasing.po.attachmentName')} onChange={(e) => set('attachments', draft.attachments.map((x) => (x.id === a.id ? { ...x, name: e.target.value } : x)))} aria-label={t('purchasing.po.attachmentName')} />
                    <Input value={a.url} placeholder="https://…" onChange={(e) => set('attachments', draft.attachments.map((x) => (x.id === a.id ? { ...x, url: e.target.value } : x)))} aria-label={t('purchasing.po.attachmentUrl')} />
                    <a
                      href={a.url || undefined}
                      target="_blank"
                      rel="noopener noreferrer"
                      className={cn('inline-flex h-9 items-center justify-center rounded-lg border border-slate-300 px-3 dark:border-slate-700', !a.url && 'pointer-events-none opacity-40')}
                      aria-label={a.name || a.url}
                    >
                      <ExternalLink className="size-4" />
                    </a>
                    <Button variant="ghost" icon={Trash2} className="text-red-600" onClick={() => set('attachments', draft.attachments.filter((x) => x.id !== a.id))} aria-label={t('common.delete')} />
                  </li>
                ))}
              </ul>
            )}
          </section>

          </fieldset>
          {/* Vínculos */}
          {existing && (
            <section className="rounded-lg border border-slate-200 p-4 dark:border-slate-800">
              <h3 className="mb-3 flex items-center gap-2 font-semibold">
                <LinkIcon className="size-4 text-slate-400" /> {t('purchasing.po.links')}
              </h3>
              {linkedProjects.length === 0 && linkedSpindles.length === 0 ? (
                <p className="text-sm text-slate-500">{t('purchasing.po.noLinks')}</p>
              ) : (
                <div className="flex flex-wrap gap-2">
                  {linkedProjects.map(({ p, asCustomerPO, materials }) => (
                    <button key={p.id} type="button" onClick={() => go('/calendar', p.id)} className="inline-flex items-center gap-2 rounded-lg border border-slate-200 px-3 py-1.5 text-sm hover:border-brand-500 dark:border-slate-700">
                      <FolderKanban className="size-4" style={{ color: p.color }} />
                      <span className="font-mono text-xs">{p.projectNumber}</span>
                      <span className="text-slate-500">{asCustomerPO ? p.customer : `${materials.length}× ${t('purchasing.po.materialFor', { number: p.projectNumber })}`}</span>
                      <StatusBadge kind="projectStatus" value={p.status} />
                    </button>
                  ))}
                  {linkedSpindles.map((s) => (
                    <button key={s.id} type="button" onClick={() => go('/financial', s.id)} className="inline-flex items-center gap-2 rounded-lg border border-slate-200 px-3 py-1.5 text-sm hover:border-brand-500 dark:border-slate-700">
                      <Cog className="size-4 text-slate-500" />
                      <span className="font-mono text-xs">{s.serialNumber}</span>
                      <span className="text-slate-500">
                        {s.manufacturer} {s.model}
                      </span>
                      <StatusBadge kind="spindleStatus" value={s.status} />
                    </button>
                  ))}
                </div>
              )}
            </section>
          )}
        </form>
      </Drawer>

      <ConfirmDialog
        open={confirmDelete}
        title={t('purchasing.po.deleteTitle')}
        message={t('purchasing.po.deleteMessage', { number: existing?.poNumber ?? '' })}
        confirmLabel={t('common.delete')}
        onConfirm={remove}
        onCancel={() => setConfirmDelete(false)}
      />
    </>
  );
}
