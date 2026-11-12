import { useEffect, useMemo, useState, type FormEvent } from 'react';
import { FilePlus2, Plus, Send } from 'lucide-react';
import { StatusBadge } from '@/components/ui/Badge';
import { Button } from '@/components/ui/Button';
import { Drawer } from '@/components/ui/Drawer';
import { Field, Input, Select, Textarea } from '@/components/ui/Field';
import { useToast } from '@/components/ui/Toast';
import { useCollection } from '@/data/hooks';
import { isProjectActive, normPN, quoteState } from '@/domain/purchasing';
import { requisitionService } from '@/domain/requisitions';
import { scheduleService } from '@/domain/schedule';
import { useI18n } from '@/i18n';
import { formatDate } from '@/lib/format';
import { newId } from '@/lib/id';
import { PlantBadge } from '@/modules/extensions/PlantBadge';
import { usePurchasingData } from '../usePurchasingData';

/**
 * Office: nova requisição a partir da tela de Compras.
 * Escolhe o projeto, marca materiais "A comprar" ou adiciona novos, e envia para a logística.
 */
export function RequisitionWizardDrawer({ open, initialProjectId, onClose, onCreated }: { open: boolean; initialProjectId?: string; onClose: () => void; onCreated?: (id: string) => void }) {
  const { t } = useI18n();
  const toast = useToast();
  const pd = usePurchasingData();
  const catalog = useCollection('materials');
  const [projectId, setProjectId] = useState('');
  const [selected, setSelected] = useState<string[]>([]);
  const [neededBy, setNeededBy] = useState('');
  const [notes, setNotes] = useState('');
  const [nm, setNm] = useState({ partNumber: '', description: '', quantity: 1 });
  const [nmError, setNmError] = useState(false);

  const project = pd.projects.find((p) => p.id === projectId);
  const start = projectId ? pd.starts.get(projectId) : undefined;
  const available = useMemo(() => (project ? project.materials.filter((m) => !m.poId && !m.requisitionId && m.status !== 'received') : []), [project]);

  useEffect(() => {
    if (!open) return;
    setProjectId(initialProjectId ?? '');
    setSelected([]);
    setNotes('');
    setNm({ partNumber: '', description: '', quantity: 1 });
    setNmError(false);
  }, [open, initialProjectId]);

  useEffect(() => {
    setSelected(available.map((m) => m.id));
    setNeededBy(available.map((m) => m.neededBy ?? start).filter((d): d is string => !!d).sort()[0] ?? start ?? '');
  }, [projectId]);

  const addMaterial = () => {
    if (!project || !nm.description.trim()) return setNmError(true);
    const id = newId('mat');
    scheduleService.upsertMaterial(project.id, { id, partNumber: nm.partNumber.trim(), description: nm.description.trim(), quantity: Math.max(1, nm.quantity), status: 'to_buy', neededBy: start });
    setSelected((s) => [...s, id]);
    setNm({ partNumber: '', description: '', quantity: 1 });
    setNmError(false);
  };

  const submit = (e: FormEvent) => {
    e.preventDefault();
    if (!project || !selected.length) return;
    const pr = requisitionService.create(project.id, selected, { neededBy, notes });
    if (pr) {
      toast.success(t('process.req.created', { number: pr.number }));
      onCreated?.(pr.id);
    }
    onClose();
  };

  const projects = pd.projects.filter(isProjectActive).sort((a, b) => (pd.starts.get(a.id) ?? '9').localeCompare(pd.starts.get(b.id) ?? '9'));

  return (
    <Drawer
      open={open}
      onClose={onClose}
      width="xl"
      title={
        <span className="flex items-center gap-2">
          <FilePlus2 className="size-5 text-brand-600" /> {t('process.req.newTitle')}
        </span>
      }
      footer={
        <>
          <Button onClick={onClose}>{t('common.cancel')}</Button>
          <Button variant="primary" icon={Send} type="submit" form="req-wizard" disabled={!project || !selected.length}>
            {t('process.req.submit')} ({selected.length})
          </Button>
        </>
      }
    >
      <form id="req-wizard" onSubmit={submit} className="space-y-6" noValidate>
        <Field label={t('process.req.project')} required>
          {(id) => (
            <Select
              id={id}
              name="reqProject"
              value={projectId}
              onChange={setProjectId}
              options={[
                { value: '', label: t('process.req.selectProject') },
                ...projects.map((p) => ({ value: p.id, label: `${p.projectNumber} — ${p.customer}${pd.starts.get(p.id) ? ` (${formatDate(pd.starts.get(p.id))})` : ''}` })),
              ]}
              autoFocus
            />
          )}
        </Field>

        {project && (
          <>
            <section>
              <h3 className="mb-2 font-semibold">{t('process.req.items')}</h3>
              {available.length === 0 ? (
                <p className="rounded-lg border border-dashed border-slate-300 p-4 text-sm text-slate-500 dark:border-slate-700">{t('process.req.noToBuy')}</p>
              ) : (
                <ul className="divide-y divide-slate-100 rounded-lg border border-slate-200 dark:divide-slate-800 dark:border-slate-800">
                  {available.map((m) => (
                    <li key={m.id} className="flex flex-wrap items-center gap-3 px-3 py-2.5 text-sm">
                      <input
                        type="checkbox"
                        className="size-4 accent-amber-500"
                        checked={selected.includes(m.id)}
                        onChange={(e) => setSelected(e.target.checked ? [...selected, m.id] : selected.filter((x) => x !== m.id))}
                        aria-label={m.description}
                      />
                      <div className="min-w-0 flex-1">
                        <p className="font-medium">
                          {m.description} <span className="text-xs font-normal text-slate-500">× {m.quantity}</span>
                        </p>
                        <p className="flex flex-wrap items-center gap-2 text-xs text-slate-500">
                          <span className="font-mono">{m.partNumber || '—'}</span>
                          <StatusBadge kind="quoteState" value={quoteState(pd.catalogByPN.get(normPN(m.partNumber)), pd.today)} />
                          {m.partNumber && <PlantBadge partNumber={m.partNumber} prefill={{ description: m.description, projectId: project.id, neededBy: m.neededBy ?? start }} />}
                        </p>
                      </div>
                    </li>
                  ))}
                </ul>
              )}
            </section>

            <section className="space-y-3 rounded-lg border border-dashed border-slate-300 p-3 dark:border-slate-700">
              <p className="flex items-center gap-2 text-sm font-semibold">
                <Plus className="size-4 text-slate-400" /> {t('process.req.addMaterial')}
              </p>
              <div className="grid gap-3 sm:grid-cols-[180px_1fr_90px_auto]">
                <Input
                  value={nm.partNumber}
                  onChange={(e) => {
                    const cat = pd.catalogByPN.get(normPN(e.target.value));
                    setNm({ ...nm, partNumber: e.target.value, description: nm.description || cat?.description || '' });
                  }}
                  placeholder={t('purchasing.po.partNumber')}
                  list="wizard-pns"
                  className="font-mono"
                  aria-label={t('purchasing.po.partNumber')}
                />
                <Input value={nm.description} onChange={(e) => { setNm({ ...nm, description: e.target.value }); setNmError(false); }} placeholder={t('purchasing.po.description')} invalid={nmError} aria-label={t('purchasing.po.description')} />
                <Input type="number" min={1} value={nm.quantity} onChange={(e) => setNm({ ...nm, quantity: Number(e.target.value) })} aria-label={t('process.req.quantity')} />
                <Button icon={Plus} onClick={addMaterial}>
                  {t('common.add')}
                </Button>
              </div>
              {nmError && <p className="text-xs text-red-600">{t('purchasing.validation.descriptionRequired')}</p>}
              <datalist id="wizard-pns">
                {catalog.map((c) => (
                  <option key={c.id} value={c.partNumber}>
                    {c.description}
                  </option>
                ))}
              </datalist>
            </section>

            <div className="grid gap-4 sm:grid-cols-2">
              <Field label={t('process.req.neededBy')}>
                {(id) => <Input id={id} type="date" value={neededBy} onChange={(e) => setNeededBy(e.target.value)} />}
              </Field>
              <Field label={t('process.req.notes')}>
                {(id) => <Textarea id={id} rows={2} value={notes} onChange={(e) => setNotes(e.target.value)} />}
              </Field>
            </div>
          </>
        )}
      </form>
    </Drawer>
  );
}
