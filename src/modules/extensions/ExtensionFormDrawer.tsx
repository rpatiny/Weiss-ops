import { useEffect, useMemo, useState, type FormEvent } from 'react';
import { Globe2, Send } from 'lucide-react';
import { Button } from '@/components/ui/Button';
import { Drawer } from '@/components/ui/Drawer';
import { Field, Input, Select, Textarea } from '@/components/ui/Field';
import { useToast } from '@/components/ui/Toast';
import { useCollection } from '@/data/hooks';
import { extensionService, validateExtension, type ExtensionDraft } from '@/domain/extensions';
import { isProjectActive, normPN } from '@/domain/purchasing';
import { useI18n } from '@/i18n';
import { HOME_PLANT, SAP_PLANTS } from '@/lib/config';

export interface ExtensionPrefill {
  partNumber?: string;
  description?: string;
  projectId?: string;
  neededBy?: string;
}

const empty = (p?: ExtensionPrefill): ExtensionDraft => ({
  partNumber: p?.partNumber ?? '',
  description: p?.description ?? '',
  supplierId: undefined,
  fromPlant: 'DE01',
  toPlant: HOME_PLANT,
  projectId: p?.projectId,
  neededBy: p?.neededBy,
  notes: '',
});

/** Pedido de extensão de material (qualquer perfil com 'extension.request'). */
export function ExtensionFormDrawer({ open, prefill, onClose }: { open: boolean; prefill?: ExtensionPrefill; onClose: () => void }) {
  const { t } = useI18n();
  const toast = useToast();
  const catalog = useCollection('materials');
  const suppliers = useCollection('suppliers');
  const projects = useCollection('projects');
  const [d, setD] = useState<ExtensionDraft>(empty());
  const [errors, setErrors] = useState<ReturnType<typeof validateExtension>>({});
  const catByPN = useMemo(() => new Map(catalog.map((c) => [normPN(c.partNumber), c])), [catalog]);

  const fillFromCatalog = (draft: ExtensionDraft): ExtensionDraft => {
    const cat = catByPN.get(normPN(draft.partNumber));
    if (!cat) return draft;
    const from = cat.plants?.find((pl) => pl !== draft.toPlant) ?? draft.fromPlant;
    return { ...draft, description: draft.description || cat.description, supplierId: draft.supplierId ?? cat.offers[0]?.supplierId, fromPlant: from };
  };

  useEffect(() => {
    if (!open) return;
    setErrors({});
    setD(fillFromCatalog(empty(prefill)));
  }, [open, prefill?.partNumber, prefill?.projectId]);

  const set = <K extends keyof ExtensionDraft>(k: K, v: ExtensionDraft[K]) => setD((x) => (k === 'partNumber' ? fillFromCatalog({ ...x, partNumber: String(v), description: '' }) : { ...x, [k]: v }));

  const submit = (e: FormEvent) => {
    e.preventDefault();
    const errs = validateExtension(d);
    setErrors(errs);
    if (Object.keys(errs).length) return;
    const x = extensionService.create(d);
    toast.success(t('extensions.created', { number: x.number }));
    onClose();
  };

  const plantOptions = SAP_PLANTS.map((p) => ({ value: p.code, label: `${p.code} — ${p.label}` }));

  return (
    <Drawer
      open={open}
      onClose={onClose}
      width="lg"
      title={
        <span className="flex items-center gap-2">
          <Globe2 className="size-5 text-indigo-500" /> {t('extensions.newTitle')}
        </span>
      }
      footer={
        <>
          <Button onClick={onClose}>{t('common.cancel')}</Button>
          <Button variant="primary" icon={Send} type="submit" form="ext-form">
            {t('extensions.submit')}
          </Button>
        </>
      }
    >
      <form id="ext-form" onSubmit={submit} className="space-y-5" noValidate>
        <p className="rounded-lg border border-indigo-200 bg-indigo-50 p-3 text-sm text-indigo-900 dark:border-indigo-900 dark:bg-indigo-950/40 dark:text-indigo-200">{t('extensions.banner', { plant: HOME_PLANT })}</p>
        <div className="grid gap-4 sm:grid-cols-[200px_1fr]">
          <Field label={t('extensions.form.partNumber')} required error={errors.partNumber && t(errors.partNumber)}>
            {(id) => <Input id={id} name="extPartNumber" value={d.partNumber} onChange={(e) => set('partNumber', e.target.value)} list="ext-pns" className="font-mono" invalid={!!errors.partNumber} autoFocus />}
          </Field>
          <Field label={t('extensions.form.description')} required error={errors.description && t(errors.description)}>
            {(id) => <Input id={id} name="extDescription" value={d.description} onChange={(e) => set('description', e.target.value)} invalid={!!errors.description} />}
          </Field>
        </div>
        <datalist id="ext-pns">
          {catalog.map((c) => (
            <option key={c.id} value={c.partNumber}>
              {c.description}
            </option>
          ))}
        </datalist>
        <div className="grid gap-4 sm:grid-cols-3">
          <Field label={t('extensions.form.fromPlant')}>
            {(id) => <Select id={id} name="fromPlant" value={d.fromPlant} onChange={(v) => set('fromPlant', v)} options={plantOptions} />}
          </Field>
          <Field label={t('extensions.form.toPlant')} error={errors.toPlant && t(errors.toPlant)}>
            {(id) => <Select id={id} name="toPlant" value={d.toPlant} onChange={(v) => set('toPlant', v)} options={plantOptions} />}
          </Field>
          <Field label={t('extensions.form.neededBy')}>
            {(id) => <Input id={id} type="date" value={d.neededBy ?? ''} onChange={(e) => set('neededBy', e.target.value || undefined)} />}
          </Field>
        </div>
        <div className="grid gap-4 sm:grid-cols-2">
          <Field label={t('extensions.form.supplier')}>
            {(id) => (
              <Select id={id} value={d.supplierId ?? ''} onChange={(v) => set('supplierId', v || undefined)} options={[{ value: '', label: '—' }, ...suppliers.map((s) => ({ value: s.id, label: s.name }))]} />
            )}
          </Field>
          <Field label={t('extensions.form.project')}>
            {(id) => (
              <Select
                id={id}
                value={d.projectId ?? ''}
                onChange={(v) => set('projectId', v || undefined)}
                options={[{ value: '', label: t('extensions.form.noProject') }, ...projects.filter(isProjectActive).map((p) => ({ value: p.id, label: `${p.projectNumber} — ${p.customer}` }))]}
              />
            )}
          </Field>
        </div>
        <Field label={t('extensions.form.notes')}>
          {(id) => <Textarea id={id} rows={3} value={d.notes} onChange={(e) => set('notes', e.target.value)} />}
        </Field>
      </form>
    </Drawer>
  );
}
