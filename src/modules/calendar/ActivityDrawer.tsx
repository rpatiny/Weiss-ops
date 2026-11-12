import { useEffect, useMemo, useState, type FormEvent } from 'react';
import { AlertTriangle, Cog, ExternalLink, FileText, Save, Trash2 } from 'lucide-react';
import { navigate } from '@/app/router';
import { Button } from '@/components/ui/Button';
import { Drawer } from '@/components/ui/Drawer';
import { Field, Input, Select, Textarea } from '@/components/ui/Field';
import { ConfirmDialog } from '@/components/ui/Modal';
import { useToast } from '@/components/ui/Toast';
import { useCollection } from '@/data/hooks';
import {
  activityService,
  conflictsForDraft,
  emptyActivity,
  nextRouteOrder,
  validateActivity,
  type ActivityDraft,
  type ActivityErrors,
} from '@/domain/calendar';
import { enumOptions } from '@/domain/labels';
import { useI18n } from '@/i18n';
import { formatDate } from '@/lib/format';
import type { CalendarActivity } from '@/types/models';

interface Props {
  open: boolean;
  /** Atividade em edição; ausente = criação com `defaults`. */
  activity?: CalendarActivity;
  defaults?: Partial<ActivityDraft>;
  onClose: () => void;
}

export function ActivityDrawer({ open, activity, defaults, onClose }: Props) {
  const { t } = useI18n();
  const toast = useToast();
  const employees = useCollection('employees');
  const activities = useCollection('activities');
  const purchaseOrders = useCollection('purchaseOrders');
  const spindles = useCollection('spindles');

  const [draft, setDraft] = useState<ActivityDraft>(emptyActivity());
  const [errors, setErrors] = useState<ActivityErrors>({});
  const [touched, setTouched] = useState(false);
  const [confirmDelete, setConfirmDelete] = useState(false);

  useEffect(() => {
    if (!open) return;
    if (activity) {
      const { id: _id, ...rest } = activity;
      setDraft(rest);
    } else {
      setDraft(emptyActivity(defaults));
    }
    setErrors({});
    setTouched(false);
  }, [open, activity?.id]);

  /** Clientes conhecidos (agenda, POs e spindles) → endereço mais recente. */
  const knownCustomers = useMemo(() => {
    const map = new Map<string, string>();
    for (const p of purchaseOrders) map.set(p.customerOrVendor, map.get(p.customerOrVendor) ?? '');
    for (const s of spindles) map.set(s.customer, map.get(s.customer) ?? '');
    for (const a of [...activities].sort((x, y) => x.date.localeCompare(y.date))) if (a.address) map.set(a.customer, a.address);
    return map;
  }, [activities, purchaseOrders, spindles]);

  const set = <K extends keyof ActivityDraft>(key: K, value: ActivityDraft[K]) => {
    setDraft((prev) => {
      const next = { ...prev, [key]: value };
      // Autopreenchimentos úteis
      // Nova atividade: vai para o fim da rota do colaborador/dia escolhido.
      if (!activity && (key === 'employeeId' || key === 'date') && next.employeeId && next.date) {
        next.routeOrder = nextRouteOrder(next.employeeId, next.date);
      }
      if (key === 'customer' && !prev.address.trim()) {
        const addr = knownCustomers.get(String(value));
        if (addr) next.address = addr;
      }
      if (key === 'spindleId' && value) {
        const sp = spindles.find((s) => s.id === value);
        if (sp?.poId && !prev.poId) next.poId = sp.poId;
        if (sp && !prev.customer.trim()) {
          next.customer = sp.customer;
          if (!prev.address.trim()) next.address = knownCustomers.get(sp.customer) ?? '';
        }
      }
      if (key === 'poId' && value && !prev.customer.trim()) {
        const po = purchaseOrders.find((p) => p.id === value);
        if (po) {
          next.customer = po.customerOrVendor;
          if (!prev.address.trim()) next.address = knownCustomers.get(po.customerOrVendor) ?? '';
        }
      }
      if (touched) setErrors(validateActivity(next, employees, activity));
      return next;
    });
  };

  const conflicts = conflictsForDraft(draft, activities, activity?.id);
  const err = (k: keyof ActivityDraft) => {
    const key = errors[k];
    return key ? t(key) : undefined;
  };

  // Ativos + o colaborador atual (mesmo inativo) para preservar histórico.
  const employeeOptions = [
    { value: '', label: t('calendar.form.selectEmployee') },
    ...employees
      .filter((e) => e.status === 'active' || e.id === activity?.employeeId)
      .sort((a, b) => a.name.localeCompare(b.name))
      .map((e) => ({ value: e.id, label: e.status === 'inactive' ? `${e.name} ${t('calendar.form.inactiveSuffix')}` : e.name })),
  ];

  const poOptions = [
    { value: '', label: t('calendar.form.noLink') },
    ...[...purchaseOrders].sort((a, b) => b.orderDate.localeCompare(a.orderDate)).map((p) => ({ value: p.id, label: `${p.poNumber} — ${p.customerOrVendor}` })),
  ];
  const spindleOptions = [
    { value: '', label: t('calendar.form.noLink') },
    ...[...spindles]
      .sort((a, b) => b.receivedDate.localeCompare(a.receivedDate))
      .map((s) => ({ value: s.id, label: `${s.serialNumber} — ${s.manufacturer} ${s.model} (${s.customer})` })),
  ];

  const submit = (ev: FormEvent) => {
    ev.preventDefault();
    setTouched(true);
    const errs = validateActivity(draft, employees, activity);
    setErrors(errs);
    if (Object.keys(errs).length) return;
    if (activity) {
      activityService.update(activity.id, draft);
      toast.success(t('calendar.toast.updated'));
    } else {
      activityService.create(draft);
      toast.success(t('calendar.toast.created'));
    }
    if (conflicts.length) {
      const emp = employees.find((e) => e.id === draft.employeeId);
      toast.error(t('calendar.toast.conflictCreated', { employee: emp?.name ?? '', date: formatDate(draft.date) }));
    }
    onClose();
  };

  const remove = () => {
    if (!activity) return;
    activityService.remove(activity.id);
    toast.success(t('calendar.toast.deleted'));
    setConfirmDelete(false);
    onClose();
  };

  const go = (path: '/purchase-orders' | '/financial', id: string) => {
    onClose();
    navigate(path, { open: id });
  };

  return (
    <>
      <Drawer
        open={open}
        onClose={onClose}
        width="lg"
        title={activity ? t('calendar.form.editTitle') : t('calendar.form.newTitle')}
        subtitle={activity ? `${activity.customer} · ${formatDate(activity.date)}` : undefined}
        footer={
          <>
            {activity && (
              <Button variant="ghost" icon={Trash2} className="mr-auto text-red-600" onClick={() => setConfirmDelete(true)}>
                {t('common.delete')}
              </Button>
            )}
            <Button onClick={onClose}>{t('common.cancel')}</Button>
            <Button variant="primary" icon={Save} type="submit" form="activity-form">
              {activity ? t('calendar.form.submitSave') : t('calendar.form.submitCreate')}
            </Button>
          </>
        }
      >
        <form id="activity-form" onSubmit={submit} className="space-y-5" noValidate>
          {conflicts.length > 0 && (
            <div role="alert" className="flex gap-3 rounded-lg border border-red-300 bg-red-50 p-3 text-sm text-red-800 dark:border-red-800 dark:bg-red-950/40 dark:text-red-300">
              <AlertTriangle className="size-5 shrink-0" />
              <div>
                <p className="font-semibold">{t('calendar.conflict')}</p>
                <p>{t('calendar.form.conflictWarning', { list: conflicts.map((c) => `${c.startTime}–${c.endTime} ${c.customer}`).join('; ') })}</p>
              </div>
            </div>
          )}

          <div className="grid gap-4 sm:grid-cols-2">
            <Field label={t('calendar.form.employee')} required error={err('employeeId')}>
              {(id) => <Select id={id} name="employeeId" value={draft.employeeId} onChange={(v) => set('employeeId', v)} options={employeeOptions} />}
            </Field>
            <Field label={t('calendar.form.serviceType')}>
              {(id) => <Select id={id} name="serviceType" value={draft.serviceType} onChange={(v) => set('serviceType', v)} options={enumOptions(t, 'serviceType')} />}
            </Field>
          </div>

          <Field label={t('calendar.form.customer')} required error={err('customer')}>
            {(id) => (
              <Input id={id} name="customer" value={draft.customer} onChange={(e) => set('customer', e.target.value)} invalid={!!errors.customer} placeholder={t('calendar.form.customerPlaceholder')} list="known-customers" />
            )}
          </Field>
          <datalist id="known-customers">
            {[...knownCustomers.keys()].sort().map((c) => (
              <option key={c} value={c} />
            ))}
          </datalist>

          <Field label={t('calendar.form.address')}>
            {(id) => <Input id={id} name="address" value={draft.address} onChange={(e) => set('address', e.target.value)} placeholder={t('calendar.form.addressPlaceholder')} />}
          </Field>

          <Field label={t('calendar.form.description')}>
            {(id) => <Textarea id={id} name="description" rows={2} value={draft.description} onChange={(e) => set('description', e.target.value)} />}
          </Field>

          <div className="grid grid-cols-2 gap-4 sm:grid-cols-4">
            <Field label={t('calendar.form.date')} required error={err('date')} className="col-span-2 sm:col-span-1">
              {(id) => <Input id={id} name="date" type="date" value={draft.date} onChange={(e) => set('date', e.target.value)} invalid={!!errors.date} />}
            </Field>
            <Field label={t('calendar.form.startTime')} required error={err('startTime')}>
              {(id) => <Input id={id} name="startTime" type="time" step={900} value={draft.startTime} onChange={(e) => set('startTime', e.target.value)} invalid={!!errors.startTime} />}
            </Field>
            <Field label={t('calendar.form.endTime')} required error={err('endTime')}>
              {(id) => <Input id={id} name="endTime" type="time" step={900} value={draft.endTime} onChange={(e) => set('endTime', e.target.value)} invalid={!!errors.endTime} />}
            </Field>
            <Field label={t('calendar.form.routeOrder')} className="col-span-2 sm:col-span-1">
              {(id) => <Input id={id} name="routeOrder" type="number" min={1} value={draft.routeOrder} onChange={(e) => set('routeOrder', Number(e.target.value))} />}
            </Field>
          </div>

          <Field label={t('common.status')}>
            {(id) => <Select id={id} name="status" value={draft.status} onChange={(v) => set('status', v)} options={enumOptions(t, 'activityStatus')} />}
          </Field>

          <fieldset className="space-y-4 rounded-lg border border-slate-200 p-4 dark:border-slate-800">
            <legend className="px-1 text-sm font-semibold text-slate-700 dark:text-slate-300">{t('calendar.form.links')}</legend>
            <Field label={t('calendar.form.linkPO')}>
              {(id) => (
                <div className="flex gap-2">
                  <Select id={id} name="poId" value={draft.poId ?? ''} onChange={(v) => set('poId', v || undefined)} options={poOptions} />
                  {draft.poId && <Button icon={ExternalLink} onClick={() => go('/purchase-orders', draft.poId!)} title={t('calendar.openPO', { number: purchaseOrders.find((p) => p.id === draft.poId)?.poNumber ?? '' })} aria-label="PO" />}
                </div>
              )}
            </Field>
            <Field label={t('calendar.form.linkSpindle')}>
              {(id) => (
                <div className="flex gap-2">
                  <Select id={id} name="spindleId" value={draft.spindleId ?? ''} onChange={(v) => set('spindleId', v || undefined)} options={spindleOptions} />
                  {draft.spindleId && <Button icon={ExternalLink} onClick={() => go('/financial', draft.spindleId!)} title={t('calendar.openSpindle', { serial: spindles.find((s) => s.id === draft.spindleId)?.serialNumber ?? '' })} aria-label="Spindle" />}
                </div>
              )}
            </Field>
            {(draft.poId || draft.spindleId) && (
              <div className="flex flex-wrap gap-2 text-xs text-slate-500">
                {draft.poId && (
                  <span className="inline-flex items-center gap-1">
                    <FileText className="size-3.5" /> {purchaseOrders.find((p) => p.id === draft.poId)?.poNumber}
                  </span>
                )}
                {draft.spindleId && (
                  <span className="inline-flex items-center gap-1">
                    <Cog className="size-3.5" /> {spindles.find((s) => s.id === draft.spindleId)?.serialNumber}
                  </span>
                )}
              </div>
            )}
          </fieldset>
        </form>
      </Drawer>

      <ConfirmDialog
        open={confirmDelete}
        title={t('calendar.form.deleteTitle')}
        message={t('calendar.form.deleteMessage', { customer: activity?.customer ?? '', date: activity ? formatDate(activity.date) : '' })}
        confirmLabel={t('common.delete')}
        onConfirm={remove}
        onCancel={() => setConfirmDelete(false)}
      />
    </>
  );
}
