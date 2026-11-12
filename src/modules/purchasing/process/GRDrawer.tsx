import { useEffect, useState, type FormEvent } from 'react';
import { PackageCheck } from 'lucide-react';
import { Button } from '@/components/ui/Button';
import { Drawer } from '@/components/ui/Drawer';
import { Field, Input } from '@/components/ui/Field';
import { useToast } from '@/components/ui/Toast';
import { useCollection } from '@/data/hooks';
import { openQty, receivedQty, requisitionService } from '@/domain/requisitions';
import type { TranslationKey } from '@/i18n/types';
import { useI18n } from '@/i18n';
import { todayISO } from '@/lib/dates';
import { cn } from '@/lib/cn';
import { formatDate } from '@/lib/format';

/** Logística: registra o GR (após o goods receipt no SAP). Atualiza projetos na hora. */
export function GRDrawer({ open, poId, onClose }: { open: boolean; poId?: string; onClose: () => void }) {
  const { t } = useI18n();
  const toast = useToast();
  const po = useCollection('purchaseOrders').find((p) => p.id === poId);
  const users = useCollection('users');
  const [grNumber, setGrNumber] = useState('');
  const [date, setDate] = useState(todayISO());
  const [notes, setNotes] = useState('');
  const [qty, setQty] = useState<Record<string, number>>({});
  const [error, setError] = useState<TranslationKey>();

  useEffect(() => {
    if (!open) return;
    setGrNumber('');
    setDate(todayISO());
    setNotes('');
    setQty({});
    setError(undefined);
  }, [open, poId]);

  if (!po) return null;
  const lines = po.lines.filter((l) => l.status !== 'canceled');
  const anyOpen = lines.some((l) => openQty(l) > 0);
  const receipts = po.lines.flatMap((l) => (l.receipts ?? []).map((r) => ({ r, l }))).sort((a, b) => b.r.date.localeCompare(a.r.date));

  const submit = (e: FormEvent) => {
    e.preventDefault();
    const res = requisitionService.registerGR(po.id, { grNumber, date, notes, lines: Object.entries(qty).map(([lineId, quantity]) => ({ lineId, quantity })) });
    if (res.error) return setError(res.error);
    toast.success(t('process.gr.done', { number: grNumber.trim() }));
    onClose();
  };

  return (
    <Drawer
      open={open}
      onClose={onClose}
      width="xl"
      title={t('process.gr.title')}
      subtitle={t('process.gr.subtitle', { number: po.poNumber, supplier: po.customerOrVendor })}
      footer={
        <>
          <Button onClick={onClose}>{t('common.cancel')}</Button>
          <Button variant="primary" icon={PackageCheck} type="submit" form="gr-form" disabled={!anyOpen}>
            {t('process.gr.submit')}
          </Button>
        </>
      }
    >
      <form id="gr-form" onSubmit={submit} className="space-y-5" noValidate>
        {!anyOpen && <p className="text-sm text-slate-500">{t('process.gr.noOpen')}</p>}
        <div className="grid gap-4 sm:grid-cols-3">
          <Field label={t('process.gr.grNumber')} required>
            {(id) => <Input id={id} name="grNumber" value={grNumber} onChange={(e) => setGrNumber(e.target.value)} className="font-mono" placeholder="5000…" autoFocus />}
          </Field>
          <Field label={t('process.gr.date')}>
            {(id) => <Input id={id} type="date" value={date} onChange={(e) => setDate(e.target.value)} />}
          </Field>
          <Field label={t('purchasing.po.notes')}>
            {(id) => <Input id={id} value={notes} onChange={(e) => setNotes(e.target.value)} />}
          </Field>
        </div>

        <div className="flex justify-end">
          <Button size="sm" onClick={() => setQty(Object.fromEntries(lines.map((l) => [l.id, openQty(l)])))} disabled={!anyOpen}>
            {t('process.gr.receiveAll')}
          </Button>
        </div>
        <div className="overflow-x-auto rounded-lg border border-slate-200 dark:border-slate-800">
          <table className="w-full min-w-[640px] text-sm">
            <thead className="bg-slate-50 dark:bg-slate-800/50">
              <tr>
                <th className="th">{t('purchasing.po.description')}</th>
                <th className="th w-24 text-right">{t('process.gr.ordered')}</th>
                <th className="th w-28 text-right">{t('process.gr.received')}</th>
                <th className="th w-28">{t('purchasing.po.expected')}</th>
                <th className="th w-32 text-right">{t('process.gr.receiveNow')}</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100 dark:divide-slate-800">
              {lines.map((l) => {
                const open = openQty(l);
                const late = open > 0 && l.expectedDeliveryDate < todayISO();
                return (
                  <tr key={l.id} className={cn(open === 0 && 'opacity-50', late && 'bg-red-50 dark:bg-red-950/30')}>
                    <td className="td">
                      <p className="font-medium">{l.description}</p>
                      <p className="font-mono text-xs text-slate-500">
                        #{l.lineNumber} · {l.partNumber}
                      </p>
                    </td>
                    <td className="td text-right tabular-nums">{l.quantity}</td>
                    <td className="td text-right tabular-nums">{receivedQty(l)}</td>
                    <td className={cn('td text-xs', late && 'font-semibold text-red-600')}>{formatDate(l.expectedDeliveryDate)}</td>
                    <td className="td">
                      <Input
                        type="number"
                        min={0}
                        max={open}
                        step="any"
                        className="text-right"
                        disabled={open === 0}
                        value={qty[l.id] ?? 0}
                        onChange={(e) => setQty({ ...qty, [l.id]: Math.min(open, Math.max(0, Number(e.target.value))) })}
                        aria-label={t('process.gr.receiveNow')}
                      />
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
        {error && (
          <p role="alert" className="text-sm font-medium text-red-600">
            {t(error)}
          </p>
        )}

        {receipts.length > 0 && (
          <section>
            <h3 className="mb-2 font-semibold">{t('process.gr.history')}</h3>
            <ul className="divide-y divide-slate-100 rounded-lg border border-slate-200 text-sm dark:divide-slate-800 dark:border-slate-800">
              {receipts.map(({ r, l }) => (
                <li key={r.id} className="flex flex-wrap items-center gap-3 px-3 py-2">
                  <span className="font-mono text-xs">GR {r.grNumber}</span>
                  <span className="text-xs text-slate-500">{formatDate(r.date)}</span>
                  <span className="min-w-0 flex-1 truncate">
                    {l.partNumber} × {r.quantity}
                  </span>
                  <span className="text-xs text-slate-500">{t('process.gr.by', { user: users.find((u) => u.id === r.receivedBy)?.name ?? '—' })}</span>
                </li>
              ))}
            </ul>
          </section>
        )}
      </form>
    </Drawer>
  );
}
