import { useMemo, useState, type FormEvent } from 'react';
import { AlertTriangle, Check, ExternalLink, PackageCheck, Pencil, Plus, ShoppingCart, Trash2, X } from 'lucide-react';
import { navigate } from '@/app/router';
import { Badge, StatusBadge } from '@/components/ui/Badge';
import { Button } from '@/components/ui/Button';
import { Field, Input, Select } from '@/components/ui/Field';
import { useToast } from '@/components/ui/Toast';
import { useCollection } from '@/data/hooks';
import { enumOptions } from '@/domain/labels';
import { materialViews, scheduleService, summarizeMaterials } from '@/domain/schedule';
import { useI18n } from '@/i18n';
import { cn } from '@/lib/cn';
import { formatDate } from '@/lib/format';
import type { MaterialStatus, Project, ProjectMaterial } from '@/types/models';
import { PurchaseDrawer } from './PurchaseDrawer';

type MaterialForm = Omit<ProjectMaterial, 'id'> & { id?: string };
const emptyForm = (neededBy?: string): MaterialForm => ({ partNumber: '', description: '', quantity: 1, status: 'to_buy', neededBy });

export function MaterialsTab({ project, projectStart }: { project: Project; projectStart?: string }) {
  const { t } = useI18n();
  const toast = useToast();
  const purchaseOrders = useCollection('purchaseOrders');
  const poById = useMemo(() => new Map(purchaseOrders.map((p) => [p.id, p])), [purchaseOrders]);
  const views = materialViews(project, poById, projectStart);
  const summary = summarizeMaterials(views);

  const [selected, setSelected] = useState<string[]>([]);
  const [form, setForm] = useState<MaterialForm | null>(null);
  const [formError, setFormError] = useState(false);
  const [buying, setBuying] = useState(false);

  const toBuyIds = views.filter((v) => v.status === 'to_buy').map((v) => v.material.id);
  const selectedToBuy = selected.filter((id) => toBuyIds.includes(id));

  const save = (e: FormEvent) => {
    e.preventDefault();
    if (!form) return;
    if (!form.description.trim()) {
      setFormError(true);
      return;
    }
    const clean: MaterialForm = {
      ...form,
      partNumber: form.partNumber.trim(),
      description: form.description.trim(),
      quantity: Math.max(1, Number(form.quantity) || 1),
      neededBy: form.neededBy || undefined,
      poId: form.poId || undefined,
      poLineId: form.poId ? form.poLineId || undefined : undefined,
    };
    if (!clean.poId) delete clean.poLineId;
    scheduleService.upsertMaterial(project.id, clean);
    toast.success(t('calendar.toast.materialSaved'));
    setForm(null);
    setFormError(false);
  };

  const formPO = form?.poId ? poById.get(form.poId) : undefined;

  return (
    <div className="space-y-4">
      {/* Resumo */}
      <div className="grid grid-cols-3 gap-2">
        <SummaryChip tone="red" label={t('calendar.materials.summary.toBuy')} value={summary.toBuy} />
        <SummaryChip tone="amber" label={t('calendar.materials.summary.ordered')} value={summary.ordered} extra={summary.late ? `${summary.late} ${t('calendar.materials.late').toLowerCase()}` : undefined} />
        <SummaryChip tone="green" label={t('calendar.materials.summary.received')} value={summary.received} />
      </div>

      {views.length === 0 ? (
        <p className="rounded-lg border border-dashed border-slate-300 p-6 text-center text-sm text-slate-500 dark:border-slate-700">{t('calendar.materials.empty')}</p>
      ) : (
        <ul className="divide-y divide-slate-100 rounded-lg border border-slate-200 dark:divide-slate-800 dark:border-slate-800">
          {views.map((v) => {
            const m = v.material;
            const canSelect = v.status === 'to_buy';
            return (
              <li key={m.id} className={cn('flex items-start gap-3 p-3', v.late && 'bg-red-50/60 dark:bg-red-950/20')}>
                <input
                  type="checkbox"
                  className="mt-1 size-4 accent-amber-500 disabled:opacity-30"
                  disabled={!canSelect}
                  checked={selected.includes(m.id)}
                  onChange={(e) => setSelected(e.target.checked ? [...selected, m.id] : selected.filter((x) => x !== m.id))}
                  aria-label={m.description}
                />
                <div className="min-w-0 flex-1">
                  <div className="flex flex-wrap items-center gap-2">
                    <p className="font-medium">{m.description}</p>
                    <StatusBadge kind="materialStatus" value={v.status} />
                    {v.late && (
                      <Badge tone="red">
                        <AlertTriangle className="size-3" /> {t('calendar.materials.late')}
                      </Badge>
                    )}
                    {!v.late && v.atRisk && <Badge tone="orange">{t('calendar.materials.atRisk')}</Badge>}
                  </div>
                  <p className="mt-0.5 text-xs text-slate-500">
                    <span className="font-mono">{m.partNumber || '—'}</span> · {t('calendar.materials.quantity')} {m.quantity}
                    {m.neededBy && (
                      <>
                        {' '}
                        · {t('calendar.materials.neededBy')} {formatDate(m.neededBy)}
                      </>
                    )}
                  </p>
                  {v.po && (
                    <button
                      type="button"
                      onClick={() => navigate('/purchase-orders', { open: v.po!.id })}
                      className="mt-1 block text-left text-xs font-medium text-brand-700 hover:underline dark:text-brand-400"
                    >
                      <ExternalLink className="mr-1 inline size-3 align-[-2px]" />
                      {t('calendar.materials.po')} {v.po.poNumber} · {v.po.customerOrVendor}
                      {v.expectedDate && v.status !== 'received' && (
                        <span className={cn(v.late && 'text-red-600')}>
                          {' '}
                          · {t('calendar.materials.expected')} {formatDate(v.expectedDate)}
                        </span>
                      )}
                    </button>
                  )}
                </div>
                <div className="flex shrink-0 gap-1">
                  {v.status !== 'received' && v.status !== 'to_buy' && (
                    <Button size="sm" icon={PackageCheck} onClick={() => { scheduleService.receiveMaterial(project.id, m.id); toast.success(t('calendar.toast.materialReceived')); }} title={t('calendar.materials.receive')} aria-label={t('calendar.materials.receive')} />
                  )}
                  {v.status === 'to_buy' && (
                    <Button size="sm" icon={ShoppingCart} onClick={() => { setSelected([m.id]); setBuying(true); }} title={t('calendar.materials.buySelected', { count: 1 })} aria-label={t('calendar.materials.buySelected', { count: 1 })} className="text-red-600" />
                  )}
                  <Button size="sm" variant="ghost" icon={Pencil} onClick={() => { setForm({ ...m }); setFormError(false); }} aria-label={t('common.edit')} title={t('common.edit')} />
                  <Button size="sm" variant="ghost" icon={Trash2} className="text-red-600" onClick={() => { scheduleService.removeMaterial(project.id, m.id); toast.success(t('calendar.toast.materialDeleted')); }} aria-label={t('common.delete')} title={t('common.delete')} />
                </div>
              </li>
            );
          })}
        </ul>
      )}

      <div className="flex flex-wrap items-center gap-2">
        <Button icon={Plus} onClick={() => { setForm(emptyForm(projectStart)); setFormError(false); }}>
          {t('calendar.materials.add')}
        </Button>
        <Button variant="primary" icon={ShoppingCart} disabled={!selectedToBuy.length} onClick={() => setBuying(true)}>
          {t('calendar.materials.buySelected', { count: selectedToBuy.length })}
        </Button>
        {toBuyIds.length > 0 && !selectedToBuy.length && <span className="text-xs text-slate-500">{t('calendar.materials.selectToBuy')}</span>}
      </div>

      {form && (
        <form onSubmit={save} className="animate-pop-in space-y-4 rounded-lg border border-brand-500/50 bg-brand-50/40 p-4 dark:bg-brand-500/5" noValidate>
          <div className="grid gap-3 sm:grid-cols-[1fr_2fr]">
            <Field label={t('calendar.materials.partNumber')}>
              {(id) => <Input id={id} name="partNumber" value={form.partNumber} onChange={(e) => setForm({ ...form, partNumber: e.target.value })} className="font-mono" />}
            </Field>
            <Field label={t('calendar.materials.description')} required error={formError ? t('calendar.validation.descriptionRequired') : undefined}>
              {(id) => <Input id={id} name="materialDescription" value={form.description} onChange={(e) => setForm({ ...form, description: e.target.value })} invalid={formError} autoFocus />}
            </Field>
          </div>
          <div className="grid gap-3 sm:grid-cols-3">
            <Field label={t('calendar.materials.quantity')}>
              {(id) => <Input id={id} type="number" min={1} value={form.quantity} onChange={(e) => setForm({ ...form, quantity: Number(e.target.value) })} />}
            </Field>
            <Field label={t('calendar.materials.neededBy')}>
              {(id) => <Input id={id} type="date" value={form.neededBy ?? ''} onChange={(e) => setForm({ ...form, neededBy: e.target.value || undefined })} />}
            </Field>
            <Field label={t('calendar.materials.manualStatus')}>
              {(id) => <Select<MaterialStatus> id={id} value={form.status} onChange={(v) => setForm({ ...form, status: v })} options={enumOptions(t, 'materialStatus')} disabled={!!form.poId} />}
            </Field>
          </div>
          <div className="grid gap-3 sm:grid-cols-2">
            <Field label={t('calendar.materials.linkExisting')}>
              {(id) => (
                <Select
                  id={id}
                  value={form.poId ?? ''}
                  onChange={(v) => setForm({ ...form, poId: v || undefined, poLineId: undefined })}
                  options={[
                    { value: '', label: t('calendar.materials.noPO') },
                    ...[...purchaseOrders].sort((a, b) => b.orderDate.localeCompare(a.orderDate)).map((p) => ({ value: p.id, label: `${p.poNumber} — ${p.customerOrVendor}` })),
                  ]}
                />
              )}
            </Field>
            {formPO && (
              <Field label={t('calendar.materials.po')}>
                {(id) => (
                  <Select
                    id={id}
                    value={form.poLineId ?? ''}
                    onChange={(v) => setForm({ ...form, poLineId: v || undefined })}
                    options={[{ value: '', label: '—' }, ...formPO.lines.map((l) => ({ value: l.id, label: `#${l.lineNumber} ${l.partNumber} — ${l.description}` }))]}
                  />
                )}
              </Field>
            )}
          </div>
          <div className="flex justify-end gap-2">
            <Button size="sm" icon={X} onClick={() => setForm(null)}>
              {t('common.cancel')}
            </Button>
            <Button size="sm" variant="primary" icon={Check} type="submit">
              {t('common.save')}
            </Button>
          </div>
        </form>
      )}

      <PurchaseDrawer open={buying} project={project} materialIds={selectedToBuy} onClose={() => setBuying(false)} onCreated={() => setSelected([])} />
    </div>
  );
}

function SummaryChip({ tone, label, value, extra }: { tone: 'red' | 'amber' | 'green'; label: string; value: number; extra?: string }) {
  const tones = {
    red: 'border-red-200 bg-red-50 text-red-700 dark:border-red-900/60 dark:bg-red-950/30 dark:text-red-300',
    amber: 'border-amber-200 bg-amber-50 text-amber-800 dark:border-amber-900/60 dark:bg-amber-950/30 dark:text-amber-300',
    green: 'border-green-200 bg-green-50 text-green-700 dark:border-green-900/60 dark:bg-green-950/30 dark:text-green-300',
  };
  return (
    <div className={cn('rounded-lg border px-3 py-2', tones[tone])}>
      <p className="text-2xl font-bold tabular-nums">{value}</p>
      <p className="text-xs font-medium">{label}</p>
      {extra && <p className="text-[11px] font-semibold text-red-600">{extra}</p>}
    </div>
  );
}
