import { useEffect, useState, type FormEvent } from 'react';
import { Send } from 'lucide-react';
import { Button } from '@/components/ui/Button';
import { Drawer } from '@/components/ui/Drawer';
import { Field, Input, Textarea } from '@/components/ui/Field';
import { useToast } from '@/components/ui/Toast';
import { requisitionService } from '@/domain/requisitions';
import { useI18n } from '@/i18n';
import { formatDate } from '@/lib/format';
import type { Project } from '@/types/models';

/** Office: pede à logística a compra dos materiais selecionados do projeto. */
export function NewRequisitionDrawer({ open, project, materialIds, projectStart, onClose, onCreated }: { open: boolean; project: Project; materialIds: string[]; projectStart?: string; onClose: () => void; onCreated: () => void }) {
  const { t } = useI18n();
  const toast = useToast();
  const items = project.materials.filter((m) => materialIds.includes(m.id));
  const [neededBy, setNeededBy] = useState('');
  const [notes, setNotes] = useState('');

  useEffect(() => {
    if (!open) return;
    const earliest = items.map((m) => m.neededBy ?? projectStart).filter((d): d is string => !!d).sort()[0];
    setNeededBy(earliest ?? '');
    setNotes('');
  }, [open, materialIds.join(',')]);

  const submit = (e: FormEvent) => {
    e.preventDefault();
    const pr = requisitionService.create(project.id, materialIds, { neededBy, notes });
    if (pr) toast.success(t('process.req.created', { number: pr.number }));
    onCreated();
    onClose();
  };

  return (
    <Drawer
      open={open}
      onClose={onClose}
      width="lg"
      title={t('process.req.newTitle')}
      subtitle={t('process.req.newSubtitle', { count: items.length, number: project.projectNumber })}
      footer={
        <>
          <Button onClick={onClose}>{t('common.cancel')}</Button>
          <Button variant="primary" icon={Send} type="submit" form="new-req-form" disabled={!items.length}>
            {t('process.req.submit')}
          </Button>
        </>
      }
    >
      <form id="new-req-form" onSubmit={submit} className="space-y-5" noValidate>
        <ul className="divide-y divide-slate-100 rounded-lg border border-slate-200 text-sm dark:divide-slate-800 dark:border-slate-800">
          {items.map((m) => (
            <li key={m.id} className="flex items-center gap-3 px-3 py-2">
              <span className="min-w-0 flex-1">
                <span className="font-medium">{m.description}</span>
                <span className="block font-mono text-xs text-slate-500">{m.partNumber}</span>
              </span>
              <span className="tabular-nums">× {m.quantity}</span>
              {m.neededBy && <span className="text-xs text-slate-500">{formatDate(m.neededBy)}</span>}
            </li>
          ))}
        </ul>
        <Field label={t('process.req.neededBy')}>
          {(id) => <Input id={id} type="date" value={neededBy} onChange={(e) => setNeededBy(e.target.value)} />}
        </Field>
        <Field label={t('process.req.notes')}>
          {(id) => <Textarea id={id} rows={3} value={notes} onChange={(e) => setNotes(e.target.value)} />}
        </Field>
      </form>
    </Drawer>
  );
}
