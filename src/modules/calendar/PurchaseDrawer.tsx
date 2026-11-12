import { useEffect, useMemo, useState, type FormEvent } from 'react';
import { ShoppingCart } from 'lucide-react';
import { StatusBadge } from '@/components/ui/Badge';
import { Button } from '@/components/ui/Button';
import { Drawer } from '@/components/ui/Drawer';
import { Field, Input, Select } from '@/components/ui/Field';
import { useToast } from '@/components/ui/Toast';
import { useCollection } from '@/data/hooks';
import { isQuoteValid, lastPurchase, normPN, quoteState } from '@/domain/purchasing';
import { scheduleService } from '@/domain/schedule';
import { useI18n } from '@/i18n';
import { addDays, todayISO } from '@/lib/dates';
import { formatCurrency, formatDate } from '@/lib/format';
import type { Project } from '@/types/models';

interface Props {
  open: boolean;
  project: Project;
  materialIds: string[];
  onClose: () => void;
  onCreated: () => void;
}

/** Gera uma PO de compra para um fornecedor a partir dos materiais "A comprar" do projeto. */
export function PurchaseDrawer({ open, project, materialIds, onClose, onCreated }: Props) {
  const { t } = useI18n();
  const toast = useToast();
  const purchaseOrders = useCollection('purchaseOrders');
  const suppliers = useCollection('suppliers');
  const catalog = useCollection('materials');
  const employees = useCollection('employees');
  const items = project.materials.filter((m) => materialIds.includes(m.id));
  const today = todayISO();

  const catByPN = useMemo(() => new Map(catalog.map((c) => [normPN(c.partNumber), c])), [catalog]);

  /** Fornecedores que ofertam algum dos materiais (mais itens cobertos primeiro). */
  const suggested = useMemo(() => {
    const score = new Map<string, number>();
    for (const m of items) for (const o of catByPN.get(normPN(m.partNumber))?.offers ?? []) score.set(o.supplierId, (score.get(o.supplierId) ?? 0) + 1);
    return [...score.entries()].sort((a, b) => b[1] - a[1]).map(([id]) => id);
  }, [items, catByPN]);

  const [supplierId, setSupplierId] = useState('');
  const [requester, setRequester] = useState('');
  const [expectedDate, setExpectedDate] = useState(addDays(today, 7));
  const [paymentTerms, setPaymentTerms] = useState('28 DDL');
  const [prices, setPrices] = useState<Record<string, number>>({});
  const [error, setError] = useState(false);

  /** Preço de referência: cotação válida do fornecedor > último pago a ele > último pago a qualquer um. */
  const refPrice = (pn: string, sup: string) => {
    const offer = catByPN.get(normPN(pn))?.offers.find((o) => o.supplierId === sup);
    if (offer && isQuoteValid(offer, today)) return offer.quotedPrice!;
    return lastPurchase(pn, purchaseOrders, sup)?.price ?? lastPurchase(pn, purchaseOrders)?.price ?? 0;
  };
  const leadFor = (sup: string) =>
    Math.max(0, ...items.map((m) => catByPN.get(normPN(m.partNumber))?.offers.find((o) => o.supplierId === sup)?.leadTimeDays ?? 0));

  const applySupplier = (sup: string) => {
    setSupplierId(sup);
    setPrices(Object.fromEntries(items.map((m) => [m.id, refPrice(m.partNumber, sup)])));
    const lead = leadFor(sup);
    setExpectedDate(addDays(today, lead || 7));
  };

  useEffect(() => {
    if (!open) return;
    setError(false);
    applySupplier(suggested[0] ?? '');
  }, [open, materialIds.join(',')]);

  const total = items.reduce((s, m) => s + m.quantity * (prices[m.id] ?? 0), 0);
  const lead = supplierId ? leadFor(supplierId) : 0;

  const supplierOptions = [
    { value: '', label: t('purchasing.po.selectSupplier') },
    ...suggested.map((id) => suppliers.find((s) => s.id === id)).filter((s): s is NonNullable<typeof s> => !!s).map((s) => ({ value: s.id, label: `★ ${s.name}` })),
    ...suppliers.filter((s) => !suggested.includes(s.id)).sort((a, b) => a.name.localeCompare(b.name)).map((s) => ({ value: s.id, label: s.name })),
  ];

  const submit = (e: FormEvent) => {
    e.preventDefault();
    if (!supplierId) {
      setError(true);
      return;
    }
    const po = scheduleService.createPurchaseOrder(project.id, materialIds, { supplierId, requester, expectedDate, paymentTerms, prices });
    if (po) toast.success(t('calendar.toast.poCreated', { number: po.poNumber }));
    onCreated();
    onClose();
  };

  return (
    <Drawer
      open={open}
      onClose={onClose}
      width="lg"
      title={t('calendar.purchase.title')}
      subtitle={t('calendar.purchase.subtitle', { count: items.length, number: project.projectNumber })}
      footer={
        <>
          <Button onClick={onClose}>{t('common.cancel')}</Button>
          <Button variant="primary" icon={ShoppingCart} type="submit" form="purchase-form">
            {t('calendar.purchase.submit')}
          </Button>
        </>
      }
    >
      <form id="purchase-form" onSubmit={submit} className="space-y-5" noValidate>
        <Field
          label={t('calendar.purchase.vendor')}
          required
          error={error ? t('calendar.validation.vendorRequired') : undefined}
          hint={supplierId && lead ? t('purchasing.buy.leadHint', { days: lead, date: formatDate(addDays(today, lead)) }) : suggested.length ? `★ ${t('purchasing.buy.supplierFromCatalog')}` : undefined}
        >
          {(id) => <Select id={id} name="supplierId" value={supplierId} onChange={applySupplier} options={supplierOptions} />}
        </Field>
        <div className="grid gap-4 sm:grid-cols-3">
          <Field label={t('calendar.purchase.requester')}>
            {(id) => <Input id={id} value={requester} onChange={(e) => setRequester(e.target.value)} list="requesters" />}
          </Field>
          <datalist id="requesters">
            {employees.map((e) => (
              <option key={e.id} value={e.name} />
            ))}
          </datalist>
          <Field label={t('calendar.purchase.expectedDate')}>
            {(id) => <Input id={id} type="date" value={expectedDate} onChange={(e) => setExpectedDate(e.target.value)} />}
          </Field>
          <Field label={t('calendar.purchase.paymentTerms')}>
            {(id) => <Input id={id} value={paymentTerms} onChange={(e) => setPaymentTerms(e.target.value)} />}
          </Field>
        </div>

        <div className="overflow-x-auto rounded-lg border border-slate-200 dark:border-slate-800">
          <table className="w-full text-sm">
            <thead className="bg-slate-50 dark:bg-slate-800/50">
              <tr>
                <th className="th">{t('calendar.materials.description')}</th>
                <th className="th text-right">{t('calendar.materials.quantity')}</th>
                <th className="th w-36 text-right">{t('calendar.purchase.unitPrice')}</th>
                <th className="th text-right">{t('calendar.purchase.total')}</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100 dark:divide-slate-800">
              {items.map((m) => {
                const last = supplierId ? lastPurchase(m.partNumber, purchaseOrders, supplierId) : undefined;
                return (
                  <tr key={m.id}>
                    <td className="td">
                      <p className="font-medium">{m.description}</p>
                      <p className="flex flex-wrap items-center gap-2 text-xs text-slate-500">
                        <span className="font-mono">{m.partNumber}</span>
                        <StatusBadge kind="quoteState" value={quoteState(catByPN.get(normPN(m.partNumber)), today)} />
                        {last && <span>{t('purchasing.materials.lastPaid', { price: formatCurrency(last.price) })}</span>}
                      </p>
                    </td>
                    <td className="td text-right tabular-nums">{m.quantity}</td>
                    <td className="td">
                      <Input type="number" min={0} step="0.01" className="text-right" value={prices[m.id] ?? 0} onChange={(e) => setPrices({ ...prices, [m.id]: Number(e.target.value) })} aria-label={t('calendar.purchase.unitPrice')} />
                    </td>
                    <td className="td text-right tabular-nums">{formatCurrency(m.quantity * (prices[m.id] ?? 0))}</td>
                  </tr>
                );
              })}
            </tbody>
            <tfoot>
              <tr className="bg-slate-50 font-semibold dark:bg-slate-800/50">
                <td className="td" colSpan={3}>
                  {t('calendar.purchase.total')}
                </td>
                <td className="td text-right tabular-nums">{formatCurrency(total)}</td>
              </tr>
            </tfoot>
          </table>
        </div>
        <p className="text-xs text-slate-500">{t('purchasing.buy.priceSource')}</p>
      </form>
    </Drawer>
  );
}
