import { useEffect, useMemo, useState, type FormEvent } from 'react';
import { ExternalLink, FolderKanban, Save, Trash2 } from 'lucide-react';
import { navigate } from '@/app/router';
import { useCan } from '@/app/session';
import { StatusBadge } from '@/components/ui/Badge';
import { Button } from '@/components/ui/Button';
import { Drawer } from '@/components/ui/Drawer';
import { Field, Input, Select, Textarea } from '@/components/ui/Field';
import { ConfirmDialog } from '@/components/ui/Modal';
import { useToast } from '@/components/ui/Toast';
import { useCollection } from '@/data/hooks';
import { forecastService, spindleService, validateForecast, validateSpindle, weightedValue, type ForecastDraft, type SpindleDraft } from '@/domain/financial';
import { enumOptions } from '@/domain/labels';
import { useI18n } from '@/i18n';
import { addMonths, todayISO } from '@/lib/dates';
import { formatCurrency } from '@/lib/format';

const emptySpindle = (): SpindleDraft => ({
  serialNumber: '',
  model: '',
  manufacturer: '',
  customer: '',
  receivedDate: todayISO(),
  quoteNumber: '',
  quotedValue: 0,
  quoteStatus: 'pending',
  status: 'received',
});

/** Cadastro/edição de spindle ou motor (com PO e projetos vinculados). */
export function SpindleDrawer({ open, spindleId, onClose }: { open: boolean; spindleId?: string; onClose: () => void }) {
  const { t } = useI18n();
  const toast = useToast();
  const readOnly = !useCan()('financial.edit');
  const spindles = useCollection('spindles');
  const pos = useCollection('purchaseOrders');
  const projects = useCollection('projects');
  const existing = spindles.find((s) => s.id === spindleId);
  const [d, setD] = useState<SpindleDraft>(emptySpindle());
  const [errors, setErrors] = useState<ReturnType<typeof validateSpindle>>({});
  const [confirm, setConfirm] = useState(false);

  useEffect(() => {
    if (!open) return;
    setErrors({});
    if (existing) {
      const { id: _id, ...rest } = existing;
      setD(rest);
    } else setD(emptySpindle());
  }, [open, spindleId]);

  const customers = useMemo(() => [...new Set([...spindles.map((s) => s.customer), ...pos.filter((p) => p.kind === 'sales').map((p) => p.customerOrVendor)])].sort(), [spindles, pos]);
  const manufacturers = useMemo(() => [...new Set(spindles.map((s) => s.manufacturer).filter(Boolean))].sort(), [spindles]);

  const set = <K extends keyof SpindleDraft>(k: K, v: SpindleDraft[K]) =>
    setD((x) => {
      const next = { ...x, [k]: v };
      // Regras práticas: entregar sugere data e valor faturado; cotação aprovada/recusada sugere o status.
      if (k === 'status' && v === 'delivered') {
        next.deliveryDate = x.deliveryDate ?? todayISO();
        next.invoicedValue = x.invoicedValue ?? x.quotedValue;
      }
      if (k === 'quoteStatus' && v === 'approved' && (x.status === 'quoted' || x.status === 'under_evaluation' || x.status === 'received')) next.status = 'approved';
      if (k === 'quoteStatus' && v === 'declined') next.status = 'declined';
      if (k === 'quoteStatus' && v === 'sent' && (x.status === 'received' || x.status === 'under_evaluation')) next.status = 'quoted';
      return next;
    });

  const err = (k: keyof SpindleDraft) => (errors[k] ? t(errors[k]!) : undefined);

  const submit = (e: FormEvent) => {
    e.preventDefault();
    const errs = validateSpindle(d, spindles, spindleId);
    setErrors(errs);
    if (Object.keys(errs).length) return;
    spindleService.save(d, spindleId);
    toast.success(t('financial.spindleForm.saved'));
    onClose();
  };

  const linkedProjects = existing ? projects.filter((p) => p.spindleId === existing.id) : [];

  return (
    <>
      <Drawer
        open={open}
        onClose={onClose}
        width="lg"
        title={existing ? t('financial.spindleForm.editTitle', { serial: existing.serialNumber }) : t('financial.spindleForm.newTitle')}
        subtitle={existing ? `${existing.manufacturer} ${existing.model} · ${existing.customer}` : undefined}
        footer={
          <>
            {existing && !readOnly && (
              <Button variant="ghost" icon={Trash2} className="mr-auto text-red-600" onClick={() => setConfirm(true)}>
                {t('common.delete')}
              </Button>
            )}
            {readOnly && <span className="mr-auto text-xs text-slate-500">{t('auth.readOnly')}</span>}
            <Button onClick={onClose}>{readOnly ? t('common.close') : t('common.cancel')}</Button>
            {!readOnly && (
              <Button variant="primary" icon={Save} type="submit" form="spindle-form">
                {existing ? t('financial.spindleForm.submitSave') : t('financial.spindleForm.submitCreate')}
              </Button>
            )}
          </>
        }
      >
        <form id="spindle-form" onSubmit={submit} noValidate className="space-y-6">
          <fieldset disabled={readOnly} className="space-y-5">
            <div className="grid gap-4 sm:grid-cols-3">
              <Field label={t('financial.spindleForm.serialNumber')} required error={err('serialNumber')}>
                {(id) => <Input id={id} name="serialNumber" value={d.serialNumber} onChange={(e) => set('serialNumber', e.target.value)} className="font-mono" invalid={!!errors.serialNumber} autoFocus={!existing} />}
              </Field>
              <Field label={t('financial.spindleForm.manufacturer')}>
                {(id) => <Input id={id} name="manufacturer" value={d.manufacturer} onChange={(e) => set('manufacturer', e.target.value)} list="sp-manufacturers" />}
              </Field>
              <Field label={t('financial.spindleForm.model')} required error={err('model')}>
                {(id) => <Input id={id} name="model" value={d.model} onChange={(e) => set('model', e.target.value)} invalid={!!errors.model} />}
              </Field>
            </div>
            <datalist id="sp-manufacturers">
              {manufacturers.map((m) => (
                <option key={m} value={m} />
              ))}
            </datalist>
            <div className="grid gap-4 sm:grid-cols-[1fr_180px]">
              <Field label={t('financial.spindleForm.customer')} required error={err('customer')}>
                {(id) => <Input id={id} name="customer" value={d.customer} onChange={(e) => set('customer', e.target.value)} list="sp-customers" invalid={!!errors.customer} />}
              </Field>
              <Field label={t('financial.spindleForm.receivedDate')} required error={err('receivedDate')}>
                {(id) => <Input id={id} type="date" value={d.receivedDate} onChange={(e) => set('receivedDate', e.target.value)} />}
              </Field>
            </div>
            <datalist id="sp-customers">
              {customers.map((c) => (
                <option key={c} value={c} />
              ))}
            </datalist>
            <div className="grid gap-4 sm:grid-cols-3">
              <Field label={t('financial.spindleForm.quoteNumber')}>
                {(id) => <Input id={id} value={d.quoteNumber} onChange={(e) => set('quoteNumber', e.target.value)} className="font-mono" />}
              </Field>
              <Field label={t('financial.spindleForm.quotedValue')} error={err('quotedValue')}>
                {(id) => <Input id={id} name="quotedValue" type="number" min={0} step="0.01" value={d.quotedValue} onChange={(e) => set('quotedValue', Number(e.target.value))} className="text-right" />}
              </Field>
              <Field label={t('financial.spindleForm.quoteStatus')}>
                {(id) => <Select id={id} name="quoteStatus" value={d.quoteStatus} onChange={(v) => set('quoteStatus', v)} options={enumOptions(t, 'quoteStatus')} />}
              </Field>
            </div>
            <div className="grid gap-4 sm:grid-cols-3">
              <Field label={t('financial.spindleForm.status')}>
                {(id) => <Select id={id} name="spStatus" value={d.status} onChange={(v) => set('status', v)} options={enumOptions(t, 'spindleStatus')} />}
              </Field>
              <Field label={t('financial.spindleForm.deliveryDate')} error={err('deliveryDate')}>
                {(id) => <Input id={id} name="deliveryDate" type="date" value={d.deliveryDate ?? ''} onChange={(e) => set('deliveryDate', e.target.value || undefined)} invalid={!!errors.deliveryDate} />}
              </Field>
              <Field label={t('financial.spindleForm.invoicedValue')} hint={t('financial.spindleForm.invoicedHint')}>
                {(id) => (
                  <Input
                    id={id}
                    name="invoicedValue"
                    type="number"
                    min={0}
                    step="0.01"
                    value={d.invoicedValue ?? ''}
                    onChange={(e) => set('invoicedValue', e.target.value === '' ? undefined : Number(e.target.value))}
                    className="text-right"
                  />
                )}
              </Field>
            </div>
            <Field label={t('financial.spindleForm.po')}>
              {(id) => (
                <div className="flex gap-2">
                  <Select
                    id={id}
                    value={d.poId ?? ''}
                    onChange={(v) => set('poId', v || undefined)}
                    options={[{ value: '', label: t('financial.spindleForm.noPO') }, ...[...pos].sort((a, b) => b.orderDate.localeCompare(a.orderDate)).map((p) => ({ value: p.id, label: `${p.poNumber} — ${p.customerOrVendor}` }))]}
                  />
                  {d.poId && <Button icon={ExternalLink} onClick={() => { onClose(); navigate('/purchase-orders', { open: d.poId }); }} aria-label="PO" />}
                </div>
              )}
            </Field>
          </fieldset>

          {existing && (
            <section>
              <h3 className="mb-2 text-sm font-semibold">{t('financial.spindleForm.projects')}</h3>
              {linkedProjects.length === 0 ? (
                <p className="text-sm text-slate-500">{t('financial.spindleForm.noProjects')}</p>
              ) : (
                <div className="flex flex-wrap gap-2">
                  {linkedProjects.map((p) => (
                    <button key={p.id} type="button" onClick={() => { onClose(); navigate('/calendar', { open: p.id }); }} className="inline-flex items-center gap-2 rounded-lg border border-slate-200 px-3 py-1.5 text-sm hover:border-brand-500 dark:border-slate-700">
                      <FolderKanban className="size-4" style={{ color: p.color }} />
                      <span className="font-mono text-xs">{p.projectNumber}</span>
                      <StatusBadge kind="projectStatus" value={p.status} />
                    </button>
                  ))}
                </div>
              )}
            </section>
          )}
        </form>
      </Drawer>
      <ConfirmDialog
        open={confirm}
        title={t('financial.spindleForm.deleteTitle')}
        message={t('financial.spindleForm.deleteMessage', { serial: existing?.serialNumber ?? '' })}
        confirmLabel={t('common.delete')}
        onConfirm={() => {
          if (spindleId) spindleService.remove(spindleId);
          toast.success(t('financial.spindleForm.deleted'));
          setConfirm(false);
          onClose();
        }}
        onCancel={() => setConfirm(false)}
      />
    </>
  );
}

const emptyForecast = (): ForecastDraft => ({ customer: '', spindleModel: '', description: '', estimatedValue: 0, expectedDate: addMonths(todayISO(), 1), probability: 50 });

export function ForecastDrawer({ open, forecastId, onClose }: { open: boolean; forecastId?: string; onClose: () => void }) {
  const { t } = useI18n();
  const toast = useToast();
  const readOnly = !useCan()('financial.edit');
  const forecast = useCollection('forecast');
  const spindles = useCollection('spindles');
  const existing = forecast.find((f) => f.id === forecastId);
  const [d, setD] = useState<ForecastDraft>(emptyForecast());
  const [errors, setErrors] = useState<ReturnType<typeof validateForecast>>({});
  const [confirm, setConfirm] = useState(false);

  useEffect(() => {
    if (!open) return;
    setErrors({});
    if (existing) {
      const { id: _id, ...rest } = existing;
      setD(rest);
    } else setD(emptyForecast());
  }, [open, forecastId]);

  const customers = useMemo(() => [...new Set([...spindles.map((s) => s.customer), ...forecast.map((f) => f.customer)])].sort(), [spindles, forecast]);
  const err = (k: keyof ForecastDraft) => (errors[k] ? t(errors[k]!) : undefined);

  const submit = (e: FormEvent) => {
    e.preventDefault();
    const errs = validateForecast(d);
    setErrors(errs);
    if (Object.keys(errs).length) return;
    forecastService.save(d, forecastId);
    toast.success(t('financial.forecast.saved'));
    onClose();
  };

  return (
    <>
      <Drawer
        open={open}
        onClose={onClose}
        title={existing ? t('financial.forecast.editTitle') : t('financial.forecast.newTitle')}
        subtitle={existing?.customer}
        footer={
          <>
            {existing && !readOnly && (
              <Button variant="ghost" icon={Trash2} className="mr-auto text-red-600" onClick={() => setConfirm(true)}>
                {t('common.delete')}
              </Button>
            )}
            <Button onClick={onClose}>{readOnly ? t('common.close') : t('common.cancel')}</Button>
            {!readOnly && (
              <Button variant="primary" icon={Save} type="submit" form="forecast-form">
                {t('common.save')}
              </Button>
            )}
          </>
        }
      >
        <form id="forecast-form" onSubmit={submit} noValidate>
          <fieldset disabled={readOnly} className="space-y-4">
            <Field label={t('financial.forecast.customer')} required error={err('customer')}>
              {(id) => <Input id={id} name="fcCustomer" value={d.customer} onChange={(e) => setD({ ...d, customer: e.target.value })} list="fc-customers" invalid={!!errors.customer} autoFocus={!existing} />}
            </Field>
            <datalist id="fc-customers">
              {customers.map((c) => (
                <option key={c} value={c} />
              ))}
            </datalist>
            <Field label={t('financial.forecast.model')} required error={err('spindleModel')}>
              {(id) => <Input id={id} name="fcModel" value={d.spindleModel} onChange={(e) => setD({ ...d, spindleModel: e.target.value })} invalid={!!errors.spindleModel} />}
            </Field>
            <Field label={t('financial.forecast.description')}>
              {(id) => <Textarea id={id} rows={2} value={d.description} onChange={(e) => setD({ ...d, description: e.target.value })} />}
            </Field>
            <div className="grid gap-4 sm:grid-cols-2">
              <Field label={t('financial.forecast.estimatedValue')} required error={err('estimatedValue')}>
                {(id) => <Input id={id} name="fcValue" type="number" min={0} step="0.01" value={d.estimatedValue} onChange={(e) => setD({ ...d, estimatedValue: Number(e.target.value) })} className="text-right" invalid={!!errors.estimatedValue} />}
              </Field>
              <Field label={t('financial.forecast.expectedDate')} required error={err('expectedDate')}>
                {(id) => <Input id={id} type="date" value={d.expectedDate} onChange={(e) => setD({ ...d, expectedDate: e.target.value })} />}
              </Field>
            </div>
            <Field label={t('financial.forecast.probability')} error={err('probability')}>
              {(id) => (
                <div className="flex items-center gap-3">
                  <input id={id} type="range" min={0} max={100} step={5} value={d.probability} onChange={(e) => setD({ ...d, probability: Number(e.target.value) })} className="flex-1 accent-amber-500" />
                  <Input type="number" min={0} max={100} value={d.probability} onChange={(e) => setD({ ...d, probability: Number(e.target.value) })} className="w-20 text-right" aria-label={t('financial.forecast.probability')} />
                </div>
              )}
            </Field>
            <p className="rounded-lg bg-slate-50 p-3 text-sm dark:bg-slate-800/50">
              {t('financial.forecast.weighted')}: <strong className="tabular-nums">{formatCurrency(weightedValue(d))}</strong>
            </p>
          </fieldset>
        </form>
      </Drawer>
      <ConfirmDialog
        open={confirm}
        title={t('financial.forecast.deleteTitle')}
        message={t('financial.forecast.deleteMessage', { customer: existing?.customer ?? '' })}
        confirmLabel={t('common.delete')}
        onConfirm={() => {
          if (forecastId) forecastService.remove(forecastId);
          toast.success(t('financial.forecast.deleted'));
          setConfirm(false);
          onClose();
        }}
        onCancel={() => setConfirm(false)}
      />
    </>
  );
}
