import { useEffect, useMemo, useState, type FormEvent } from 'react';
import { ShoppingCart } from 'lucide-react';
import { Button } from '@/components/ui/Button';
import { Drawer } from '@/components/ui/Drawer';
import { Field, Input } from '@/components/ui/Field';
import { useToast } from '@/components/ui/Toast';
import { useCollection } from '@/data/hooks';
import { scheduleService } from '@/domain/schedule';
import { useI18n } from '@/i18n';
import { addDays, todayISO } from '@/lib/dates';
import { formatCurrency } from '@/lib/format';
import type { Project } from '@/types/models';

interface Props {
  open: boolean;
  project: Project;
  materialIds: string[];
  onClose: () => void;
  onCreated: () => void;
}

/** Gera uma PO de compra (fornecedor) a partir dos materiais "A comprar" do projeto. */
export function PurchaseDrawer({ open, project, materialIds, onClose, onCreated }: Props) {
  const { t } = useI18n();
  const toast = useToast();
  const purchaseOrders = useCollection('purchaseOrders');
  const employees = useCollection('employees');
  const items = project.materials.filter((m) => materialIds.includes(m.id));

  const [vendor, setVendor] = useState('');
  const [requester, setRequester] = useState('');
  const [expectedDate, setExpectedDate] = useState(addDays(todayISO(), 7));
  const [paymentTerms, setPaymentTerms] = useState('28 DDL');
  const [prices, setPrices] = useState<Record<string, number>>({});
  const [error, setError] = useState(false);

  // Sugestão: preço da última compra do mesmo part number.
  const lastPrice = useMemo(() => {
    const map = new Map<string, number>();
    for (const po of [...purchaseOrders].sort((a, b) => a.orderDate.localeCompare(b.orderDate)))
      for (const l of po.lines) if (l.unitPrice > 0) map.set(l.partNumber, l.unitPrice);
    return map;
  }, [purchaseOrders]);

  useEffect(() => {
    if (!open) return;
    const needed = items.map((m) => m.neededBy).filter((d): d is string => !!d).sort()[0];
    setExpectedDate(needed && needed > todayISO() ? addDays(needed, -1) : addDays(todayISO(), 7));
    setPrices(Object.fromEntries(items.map((m) => [m.id, lastPrice.get(m.partNumber) ?? 0])));
    setError(false);
  }, [open, materialIds.join(',')]);

  const vendors = [...new Set(purchaseOrders.map((p) => p.customerOrVendor))].sort();
  const total = items.reduce((s, m) => s + m.quantity * (prices[m.id] ?? 0), 0);

  const submit = (e: FormEvent) => {
    e.preventDefault();
    if (!vendor.trim()) {
      setError(true);
      return;
    }
    const po = scheduleService.createPurchaseOrder(project.id, materialIds, { vendor, requester, expectedDate, paymentTerms, prices });
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
        <Field label={t('calendar.purchase.vendor')} required error={error ? t('calendar.validation.vendorRequired') : undefined}>
          {(id) => <Input id={id} name="vendor" value={vendor} onChange={(e) => setVendor(e.target.value)} list="vendors" placeholder={t('calendar.purchase.vendorPlaceholder')} invalid={error} autoFocus />}
        </Field>
        <datalist id="vendors">
          {vendors.map((v) => (
            <option key={v} value={v} />
          ))}
        </datalist>
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
              {items.map((m) => (
                <tr key={m.id}>
                  <td className="td">
                    <p className="font-medium">{m.description}</p>
                    <p className="font-mono text-xs text-slate-500">{m.partNumber}</p>
                  </td>
                  <td className="td text-right tabular-nums">{m.quantity}</td>
                  <td className="td">
                    <Input type="number" min={0} step="0.01" className="text-right" value={prices[m.id] ?? 0} onChange={(e) => setPrices({ ...prices, [m.id]: Number(e.target.value) })} aria-label={t('calendar.purchase.unitPrice')} />
                  </td>
                  <td className="td text-right tabular-nums">{formatCurrency(m.quantity * (prices[m.id] ?? 0))}</td>
                </tr>
              ))}
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
      </form>
    </Drawer>
  );
}
