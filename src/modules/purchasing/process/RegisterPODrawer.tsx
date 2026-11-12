import { useEffect, useMemo, useState, type FormEvent } from 'react';
import { FileCheck2 } from 'lucide-react';
import { Button } from '@/components/ui/Button';
import { Drawer } from '@/components/ui/Drawer';
import { Field, Input, Select, Textarea } from '@/components/ui/Field';
import { useToast } from '@/components/ui/Toast';
import { useCollection } from '@/data/hooks';
import { isQuoteValid, lastPurchase, lineTotal, normPN } from '@/domain/purchasing';
import { requisitionItemViews, requisitionService } from '@/domain/requisitions';
import type { TranslationKey } from '@/i18n/types';
import { useI18n } from '@/i18n';
import { addDays } from '@/lib/dates';
import { formatCurrency } from '@/lib/format';
import { usePurchasingData } from '../usePurchasingData';
import { plantState } from '@/domain/extensions';
import { HOME_PLANT } from '@/lib/config';
import { Globe2 } from 'lucide-react';

interface Row {
  itemId: string;
  include: boolean;
  quantity: number;
  unitPrice: number;
}

/** Logística: registra aqui a PO criada no SAP para itens da requisição. */
export function RegisterPODrawer({ open, requisitionId, onClose }: { open: boolean; requisitionId: string; onClose: () => void }) {
  const { t } = useI18n();
  const toast = useToast();
  const pd = usePurchasingData();
  const pr = useCollection('requisitions').find((r) => r.id === requisitionId);
  const extensions = useCollection('extensions');
  const blocked = (pn: string) => { const s = plantState(pn, pd.catalogByPN, extensions).state; return s === 'missing' || s === 'pending'; };
  const project = pr ? pd.projects.find((p) => p.id === pr.projectId) : undefined;
  const pendingItems = useMemo(() => {
    if (!pr) return [];
    const views = requisitionItemViews(pr, project, pd.poById);
    return pr.items.filter((_, i) => views[i]!.status === 'requested' || views[i]!.status === 'to_buy');
  }, [pr, project, pd.poById]);

  const [poNumber, setPoNumber] = useState('');
  const [supplierId, setSupplierId] = useState('');
  const [orderDate, setOrderDate] = useState(pd.today);
  const [expectedDate, setExpectedDate] = useState(addDays(pd.today, 7));
  const [paymentTerms, setPaymentTerms] = useState('28 DDL');
  const [notes, setNotes] = useState('');
  const [rows, setRows] = useState<Row[]>([]);
  const [error, setError] = useState<TranslationKey>();

  /** Fornecedores que ofertam algum item (mais itens cobertos primeiro). */
  const suggested = useMemo(() => {
    const score = new Map<string, number>();
    for (const it of pendingItems) for (const o of pd.catalogByPN.get(normPN(it.partNumber))?.offers ?? []) score.set(o.supplierId, (score.get(o.supplierId) ?? 0) + 1);
    return [...score.entries()].sort((a, b) => b[1] - a[1]).map(([id]) => id);
  }, [pendingItems, pd.catalogByPN]);

  const priceFor = (pn: string, sup: string) => {
    const offer = pd.catalogByPN.get(normPN(pn))?.offers.find((o) => o.supplierId === sup);
    if (offer && isQuoteValid(offer, pd.today)) return offer.quotedPrice!;
    return lastPurchase(pn, pd.purchaseOrders, sup)?.price ?? lastPurchase(pn, pd.purchaseOrders)?.price ?? 0;
  };

  const applySupplier = (sup: string) => {
    setSupplierId(sup);
    setRows((rs) =>
      rs.map((r) => {
        const it = pendingItems.find((x) => x.id === r.itemId)!;
        const offered = !!pd.catalogByPN.get(normPN(it.partNumber))?.offers.some((o) => o.supplierId === sup);
        return { ...r, unitPrice: priceFor(it.partNumber, sup), include: (offered || suggested.length === 0) && !blocked(it.partNumber) };
      }),
    );
    const lead = Math.max(0, ...pendingItems.map((it) => pd.catalogByPN.get(normPN(it.partNumber))?.offers.find((o) => o.supplierId === sup)?.leadTimeDays ?? 0));
    setExpectedDate(addDays(orderDate, lead || 7));
  };

  useEffect(() => {
    if (!open) return;
    setError(undefined);
    setPoNumber('');
    setNotes('');
    setOrderDate(pd.today);
    setRows(pendingItems.map((it) => ({ itemId: it.id, include: !blocked(it.partNumber), quantity: it.quantity, unitPrice: 0 })));
    const first = suggested[0];
    if (first) setTimeout(() => applySupplier(first));
  }, [open, requisitionId]);

  if (!pr) return null;
  const setRow = (id: string, patch: Partial<Row>) => setRows((rs) => rs.map((r) => (r.itemId === id ? { ...r, ...patch } : r)));
  const total = rows.filter((r) => r.include).reduce((s, r) => s + lineTotal(r), 0);

  const submit = (e: FormEvent) => {
    e.preventDefault();
    const res = requisitionService.registerSapPO(pr.id, {
      poNumber,
      supplierId,
      orderDate,
      expectedDate,
      paymentTerms,
      notes,
      items: rows.filter((r) => r.include).map((r) => ({ itemId: r.itemId, quantity: r.quantity, unitPrice: r.unitPrice })),
    });
    if (res.error) return setError(res.error);
    if (res.po) toast.success(t('process.sapPO.done', { number: res.po.poNumber }));
    onClose();
  };

  return (
    <Drawer
      open={open}
      onClose={onClose}
      width="xl"
      title={t('process.sapPO.title')}
      subtitle={t('process.sapPO.subtitle', { number: pr.number, project: project ? `${project.projectNumber} · ${project.customer}` : '' })}
      footer={
        <>
          <Button onClick={onClose}>{t('common.cancel')}</Button>
          <Button variant="primary" icon={FileCheck2} type="submit" form="sap-po-form" disabled={!pendingItems.length}>
            {t('process.sapPO.submit')}
          </Button>
        </>
      }
    >
      {pendingItems.length === 0 ? (
        <p className="text-sm text-slate-500">{t('process.sapPO.none')}</p>
      ) : (
        <form id="sap-po-form" onSubmit={submit} className="space-y-5" noValidate>
          <div className="grid gap-4 sm:grid-cols-2">
            <Field label={t('process.sapPO.poNumber')} required hint={t('process.sapPO.poNumberHint')}>
              {(id) => <Input id={id} name="sapPoNumber" value={poNumber} onChange={(e) => setPoNumber(e.target.value)} className="font-mono" placeholder="4500…" autoFocus />}
            </Field>
            <Field label={t('process.sapPO.supplier')} required>
              {(id) => (
                <Select
                  id={id}
                  name="sapSupplier"
                  value={supplierId}
                  onChange={applySupplier}
                  options={[
                    { value: '', label: t('purchasing.po.selectSupplier') },
                    ...suggested.map((sid) => pd.suppliersById.get(sid)).filter((s): s is NonNullable<typeof s> => !!s).map((s) => ({ value: s.id, label: `★ ${s.name}` })),
                    ...pd.suppliers.filter((s) => !suggested.includes(s.id)).map((s) => ({ value: s.id, label: s.name })),
                  ]}
                />
              )}
            </Field>
            <Field label={t('process.sapPO.orderDate')}>
              {(id) => <Input id={id} type="date" value={orderDate} onChange={(e) => setOrderDate(e.target.value)} />}
            </Field>
            <Field label={t('process.sapPO.expectedDate')}>
              {(id) => <Input id={id} type="date" value={expectedDate} onChange={(e) => setExpectedDate(e.target.value)} />}
            </Field>
            <Field label={t('purchasing.po.paymentTerms')}>
              {(id) => <Input id={id} value={paymentTerms} onChange={(e) => setPaymentTerms(e.target.value)} />}
            </Field>
            <Field label={t('purchasing.po.notes')}>
              {(id) => <Textarea id={id} rows={1} value={notes} onChange={(e) => setNotes(e.target.value)} />}
            </Field>
          </div>

          <div className="overflow-x-auto rounded-lg border border-slate-200 dark:border-slate-800">
            <table className="w-full min-w-[640px] text-sm">
              <thead className="bg-slate-50 dark:bg-slate-800/50">
                <tr>
                  <th className="th w-16">{t('process.sapPO.include')}</th>
                  <th className="th">{t('purchasing.po.description')}</th>
                  <th className="th w-24 text-right">{t('purchasing.po.quantity')}</th>
                  <th className="th w-32 text-right">{t('purchasing.po.unitPrice')}</th>
                  <th className="th w-32 text-right">{t('purchasing.po.lineTotal')}</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100 dark:divide-slate-800">
                {rows.map((r) => {
                  const it = pendingItems.find((x) => x.id === r.itemId);
                  if (!it) return null;
                  return (
                    <tr key={r.itemId} className={r.include ? '' : 'opacity-50'}>
                      <td className="td">
                        <input type="checkbox" className="size-4 accent-amber-500" checked={r.include} onChange={(e) => setRow(r.itemId, { include: e.target.checked })} aria-label={it.description} />
                      </td>
                      <td className="td">
                        <p className="font-medium">{it.description}</p>
                        <p className="font-mono text-xs text-slate-500">{it.partNumber}</p>
                        {blocked(it.partNumber) && (
                          <p className="mt-1 flex items-center gap-1 text-xs font-medium text-red-600">
                            <Globe2 className="size-3.5" /> {t('process.sapPO.notExtended', { plant: HOME_PLANT })}
                          </p>
                        )}
                      </td>
                      <td className="td">
                        <Input type="number" min={0} step="any" className="text-right" value={r.quantity} onChange={(e) => setRow(r.itemId, { quantity: Number(e.target.value) })} aria-label={t('purchasing.po.quantity')} />
                      </td>
                      <td className="td">
                        <Input type="number" min={0} step="0.01" className="text-right" value={r.unitPrice} onChange={(e) => setRow(r.itemId, { unitPrice: Number(e.target.value) })} aria-label={t('purchasing.po.unitPrice')} />
                      </td>
                      <td className="td text-right tabular-nums">{formatCurrency(r.include ? lineTotal(r) : 0)}</td>
                    </tr>
                  );
                })}
              </tbody>
              <tfoot>
                <tr className="bg-slate-50 font-semibold dark:bg-slate-800/50">
                  <td className="td" colSpan={4}>
                    {t('purchasing.po.grandTotal')}
                  </td>
                  <td className="td text-right tabular-nums">{formatCurrency(total)}</td>
                </tr>
              </tfoot>
            </table>
          </div>
          <p className="text-xs text-slate-500">{t('purchasing.buy.priceSource')}</p>
          {error && (
            <p role="alert" className="text-sm font-medium text-red-600">
              {t(error)}
            </p>
          )}
        </form>
      )}
    </Drawer>
  );
}
