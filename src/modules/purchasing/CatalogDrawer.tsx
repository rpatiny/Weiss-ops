import { useEffect, useState, type FormEvent } from 'react';
import { FolderKanban, Plus, Save, Trash2 } from 'lucide-react';
import { navigate } from '@/app/router';
import { StatusBadge } from '@/components/ui/Badge';
import { Button } from '@/components/ui/Button';
import { Drawer } from '@/components/ui/Drawer';
import { Field, Input, Select } from '@/components/ui/Field';
import { ConfirmDialog } from '@/components/ui/Modal';
import { useToast } from '@/components/ui/Toast';
import { enumOptions } from '@/domain/labels';
import { catalogService, normPN, purchaseHistory, validateCatalog, type CatalogDraft, type Errors } from '@/domain/purchasing';
import { useI18n } from '@/i18n';
import { addDays } from '@/lib/dates';
import { formatCurrency, formatDate } from '@/lib/format';
import type { SupplierOffer } from '@/types/models';
import { usePurchasingData } from './usePurchasingData';

interface Props {
  open: boolean;
  materialId?: string;
  /** Pré-preenchimento ao cadastrar um material que só existe nos projetos. */
  prefill?: { partNumber: string; description: string };
  onClose: () => void;
}

export function CatalogDrawer({ open, materialId, prefill, onClose }: Props) {
  const { t } = useI18n();
  const toast = useToast();
  const pd = usePurchasingData();
  const existing = pd.catalog.find((m) => m.id === materialId);
  const [draft, setDraft] = useState<CatalogDraft>({ partNumber: '', description: '', unit: 'un', offers: [] });
  const [errors, setErrors] = useState<Errors<CatalogDraft>>({});
  const [confirmDelete, setConfirmDelete] = useState(false);

  useEffect(() => {
    if (!open) return;
    setErrors({});
    if (existing) {
      const { id: _id, ...rest } = existing;
      setDraft({ ...rest, offers: rest.offers.map((o) => ({ ...o })) });
    } else setDraft({ partNumber: prefill?.partNumber ?? '', description: prefill?.description ?? '', unit: 'un', offers: [] });
  }, [open, materialId, prefill?.partNumber]);

  const setOffer = (i: number, patch: Partial<SupplierOffer>) => setDraft((d) => ({ ...d, offers: d.offers.map((o, j) => (j === i ? { ...o, ...patch } : o)) }));

  const submit = (e: FormEvent) => {
    e.preventDefault();
    const errs = validateCatalog(draft, pd.catalog, materialId);
    setErrors(errs);
    if (Object.keys(errs).length) return;
    catalogService.save(draft, materialId);
    toast.success(t('purchasing.materials.saved'));
    onClose();
  };

  const history = draft.partNumber ? purchaseHistory(draft.partNumber, pd.purchaseOrders).slice(0, 8) : [];
  const demand = draft.partNumber ? (pd.demand.get(normPN(draft.partNumber)) ?? []) : [];
  const usedSuppliers = new Set(draft.offers.map((o) => o.supplierId));

  return (
    <>
      <Drawer
        open={open}
        onClose={onClose}
        width="xl"
        title={existing ? t('purchasing.materials.editTitle', { pn: existing.partNumber }) : t('purchasing.materials.newTitle')}
        subtitle={existing?.description}
        footer={
          <>
            {existing && (
              <Button variant="ghost" icon={Trash2} className="mr-auto text-red-600" onClick={() => setConfirmDelete(true)}>
                {t('common.delete')}
              </Button>
            )}
            <Button onClick={onClose}>{t('common.cancel')}</Button>
            <Button variant="primary" icon={Save} type="submit" form="catalog-form">
              {t('common.save')}
            </Button>
          </>
        }
      >
        <form id="catalog-form" onSubmit={submit} className="space-y-6" noValidate>
          <div className="grid gap-4 sm:grid-cols-[220px_1fr_120px]">
            <Field label={t('purchasing.po.partNumber')} required error={errors.partNumber && t(errors.partNumber)}>
              {(id) => <Input id={id} name="partNumber" value={draft.partNumber} onChange={(e) => setDraft({ ...draft, partNumber: e.target.value })} className="font-mono" invalid={!!errors.partNumber} />}
            </Field>
            <Field label={t('purchasing.po.description')} required error={errors.description && t(errors.description)}>
              {(id) => <Input id={id} name="description" value={draft.description} onChange={(e) => setDraft({ ...draft, description: e.target.value })} invalid={!!errors.description} />}
            </Field>
            <Field label={t('purchasing.materials.unit')}>
              {(id) => <Input id={id} value={draft.unit} onChange={(e) => setDraft({ ...draft, unit: e.target.value })} />}
            </Field>
          </div>

          <section>
            <div className="mb-2 flex items-center justify-between">
              <h3 className="font-semibold">{t('purchasing.materials.offers')}</h3>
              <Button
                size="sm"
                icon={Plus}
                onClick={() => setDraft((d) => ({ ...d, offers: [...d.offers, { supplierId: pd.suppliers.find((s) => !usedSuppliers.has(s.id))?.id ?? '', quoteStatus: 'not_requested', leadTimeDays: 7 }] }))}
              >
                {t('purchasing.materials.addOffer')}
              </Button>
            </div>
            {draft.offers.length === 0 ? (
              <p className="rounded-lg border border-dashed border-slate-300 p-4 text-sm text-slate-500 dark:border-slate-700">{t('purchasing.materials.noSuppliers')}</p>
            ) : (
              <div className="overflow-x-auto rounded-lg border border-slate-200 dark:border-slate-800">
                <table className="w-full min-w-[900px] text-sm">
                  <thead className="bg-slate-50 dark:bg-slate-800/50">
                    <tr>
                      <th className="th">{t('purchasing.po.supplier')}</th>
                      <th className="th w-40">{t('purchasing.materials.quoteStatus')}</th>
                      <th className="th w-32 text-right">{t('purchasing.po.unitPrice')}</th>
                      <th className="th w-36">{t('purchasing.materials.quoteDate')}</th>
                      <th className="th w-36">{t('purchasing.materials.validUntilCol')}</th>
                      <th className="th w-24 text-right">{t('purchasing.materials.leadTimeDays')}</th>
                      <th className="th w-36">{t('purchasing.materials.lastPaidCol')}</th>
                      <th className="th w-10" />
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100 dark:divide-slate-800">
                    {draft.offers.map((o, i) => {
                      const last = draft.partNumber && o.supplierId ? purchaseHistory(draft.partNumber, pd.purchaseOrders, o.supplierId)[0] : undefined;
                      return (
                        <tr key={i}>
                          <td className="td">
                            <Select
                              value={o.supplierId}
                              onChange={(v) => setOffer(i, { supplierId: v })}
                              options={[{ value: '', label: t('purchasing.po.selectSupplier') }, ...pd.suppliers.filter((s) => s.id === o.supplierId || !usedSuppliers.has(s.id)).map((s) => ({ value: s.id, label: s.name }))]}
                              aria-label={t('purchasing.po.supplier')}
                            />
                            <p className="mt-1 text-[11px] text-slate-500">
                              → {t('purchasing.materials.buyToday', { date: formatDate(addDays(pd.today, o.leadTimeDays || 0)) })}
                            </p>
                          </td>
                          <td className="td">
                            <Select value={o.quoteStatus} onChange={(v) => setOffer(i, { quoteStatus: v, quoteDate: v === 'received' && !o.quoteDate ? pd.today : o.quoteDate })} options={enumOptions(t, 'supplierQuoteStatus')} aria-label={t('purchasing.materials.quoteStatus')} />
                          </td>
                          <td className="td">
                            <Input type="number" min={0} step="0.01" className="text-right" value={o.quotedPrice ?? ''} onChange={(e) => setOffer(i, { quotedPrice: e.target.value === '' ? undefined : Number(e.target.value) })} aria-label={t('purchasing.po.unitPrice')} />
                          </td>
                          <td className="td">
                            <Input type="date" value={o.quoteDate ?? ''} onChange={(e) => setOffer(i, { quoteDate: e.target.value || undefined })} aria-label={t('purchasing.materials.quoteDate')} />
                          </td>
                          <td className="td">
                            <Input type="date" value={o.validUntil ?? ''} onChange={(e) => setOffer(i, { validUntil: e.target.value || undefined })} aria-label={t('purchasing.materials.validUntilCol')} />
                          </td>
                          <td className="td">
                            <Input type="number" min={0} className="text-right" value={o.leadTimeDays} onChange={(e) => setOffer(i, { leadTimeDays: Number(e.target.value) })} aria-label={t('purchasing.materials.leadTimeDays')} />
                          </td>
                          <td className="td text-xs">
                            {last ? (
                              <>
                                <p className="font-medium tabular-nums">{formatCurrency(last.price)}</p>
                                <p className="text-slate-500">
                                  {formatDate(last.date)} · {last.po.poNumber}
                                </p>
                              </>
                            ) : (
                              '—'
                            )}
                          </td>
                          <td className="td">
                            <Button size="sm" variant="ghost" icon={Trash2} className="text-red-600" onClick={() => setDraft((d) => ({ ...d, offers: d.offers.filter((_, j) => j !== i) }))} aria-label={t('common.delete')} />
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            )}
          </section>

          <div className="grid gap-6 lg:grid-cols-2">
            <section>
              <h3 className="mb-2 font-semibold">{t('purchasing.materials.demandTitle')}</h3>
              {demand.length === 0 ? (
                <p className="text-sm text-slate-500">{t('purchasing.materials.noDemand')}</p>
              ) : (
                <ul className="divide-y divide-slate-100 rounded-lg border border-slate-200 dark:divide-slate-800 dark:border-slate-800">
                  {demand.map((d) => (
                    <li key={d.material.id}>
                      <button type="button" onClick={() => { onClose(); navigate('/calendar', { open: d.project.id }); }} className="flex w-full items-center gap-3 px-3 py-2 text-left text-sm hover:bg-slate-50 dark:hover:bg-slate-800/50">
                        <FolderKanban className="size-4 shrink-0" style={{ color: d.project.color }} />
                        <span className="min-w-0 flex-1">
                          <span className="font-mono text-xs">{d.project.projectNumber}</span> {d.project.customer}
                          <span className="block text-xs text-slate-500">
                            {t('calendar.materials.quantity')} {d.material.quantity}
                            {d.start && ` · ${t('purchasing.readiness.startsOn', { date: formatDate(d.start) })}`}
                          </span>
                        </span>
                        <StatusBadge kind="materialStatus" value={d.view.status} />
                      </button>
                    </li>
                  ))}
                </ul>
              )}
            </section>
            <section>
              <h3 className="mb-2 font-semibold">{t('purchasing.materials.history')}</h3>
              {history.length === 0 ? (
                <p className="text-sm text-slate-500">{t('purchasing.materials.noHistory')}</p>
              ) : (
                <ul className="divide-y divide-slate-100 rounded-lg border border-slate-200 text-sm dark:divide-slate-800 dark:border-slate-800">
                  {history.map((h) => (
                    <li key={h.line.id} className="flex items-center gap-3 px-3 py-2">
                      <span className="w-24 text-xs text-slate-500">{formatDate(h.date)}</span>
                      <span className="min-w-0 flex-1 truncate">
                        <span className="font-mono text-xs">{h.po.poNumber}</span> · {h.po.customerOrVendor}
                      </span>
                      <span className="text-xs text-slate-500">×{h.line.quantity}</span>
                      <span className="font-medium tabular-nums">{formatCurrency(h.price)}</span>
                    </li>
                  ))}
                </ul>
              )}
            </section>
          </div>
        </form>
      </Drawer>
      <ConfirmDialog
        open={confirmDelete}
        title={t('purchasing.materials.deleteTitle')}
        message={t('purchasing.materials.deleteMessage', { pn: existing?.partNumber ?? '' })}
        confirmLabel={t('common.delete')}
        onConfirm={() => {
          if (materialId) catalogService.remove(materialId);
          toast.success(t('purchasing.materials.deleted'));
          setConfirmDelete(false);
          onClose();
        }}
        onCancel={() => setConfirmDelete(false)}
      />
    </>
  );
}
