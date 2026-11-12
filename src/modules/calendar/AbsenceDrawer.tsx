import { useEffect, useState, type FormEvent } from 'react';
import { AlertTriangle, Pencil, Plus, Save, Trash2 } from 'lucide-react';
import { StatusBadge } from '@/components/ui/Badge';
import { useCan } from '@/app/session';
import { Button } from '@/components/ui/Button';
import { Drawer } from '@/components/ui/Drawer';
import { Field, Input, Select } from '@/components/ui/Field';
import { Avatar } from '@/components/ui/misc';
import { useToast } from '@/components/ui/Toast';
import { useCollection } from '@/data/hooks';
import { enumOptions } from '@/domain/labels';
import { absenceService, validateAbsence, type AbsenceDraft, type Errors } from '@/domain/schedule';
import { useI18n } from '@/i18n';
import { addDays, businessDaysBetween, rangesOverlap, todayISO } from '@/lib/dates';
import { formatDate } from '@/lib/format';
import type { Absence } from '@/types/models';

interface Props {
  open: boolean;
  /** Ausência a editar diretamente (clique no bloqueio do cronograma). */
  editing?: Absence;
  onClose: () => void;
}

const empty = (): AbsenceDraft => ({ employeeId: '', type: 'vacation', startDate: todayISO(), endDate: addDays(todayISO(), 13), note: '' });

export function AbsenceDrawer({ open, editing, onClose }: Props) {
  const { t } = useI18n();
  const toast = useToast();
  const canEdit = useCan()('schedule.edit');
  const employees = useCollection('employees');
  const absences = useCollection('absences');
  const assignments = useCollection('assignments');
  const [form, setForm] = useState<{ id?: string; draft: AbsenceDraft } | null>(null);
  const [errors, setErrors] = useState<Errors<AbsenceDraft>>({});

  useEffect(() => {
    if (!open) return;
    setErrors({});
    if (editing) {
      const { id, ...draft } = editing;
      setForm({ id, draft });
    } else setForm(null);
  }, [open, editing?.id]);

  const today = todayISO();
  const list = absences.filter((a) => a.endDate >= today).sort((a, b) => a.startDate.localeCompare(b.startDate));
  const empById = new Map(employees.map((e) => [e.id, e]));

  const overlapping = form
    ? assignments.filter((a) => a.employeeId === form.draft.employeeId && rangesOverlap(a.startDate, a.endDate, form.draft.startDate, form.draft.endDate))
    : [];

  const save = (e: FormEvent) => {
    e.preventDefault();
    if (!form) return;
    const errs = validateAbsence(form.draft);
    setErrors(errs);
    if (Object.keys(errs).length) return;
    absenceService.save({ ...form.draft, note: form.draft.note.trim() }, form.id);
    toast.success(t('calendar.toast.absenceSaved'));
    if (overlapping.length) toast.error(t('calendar.toast.absenceOverlap', { count: overlapping.length }));
    setForm(null);
    if (editing) onClose();
  };

  const set = <K extends keyof AbsenceDraft>(k: K, v: AbsenceDraft[K]) => form && setForm({ ...form, draft: { ...form.draft, [k]: v } });

  return (
    <Drawer open={open} onClose={onClose} width="lg" title={t('calendar.absence.title')} footer={<Button onClick={onClose}>{t('common.close')}</Button>}>
      <div className="space-y-5">
        {form && canEdit ? (
          <form onSubmit={save} className="animate-pop-in space-y-4 rounded-lg border border-cyan-500/40 bg-cyan-50/40 p-4 dark:bg-cyan-500/5" noValidate>
            <p className="font-semibold">{form.id ? t('calendar.absence.edit') : t('calendar.absence.new')}</p>
            <div className="grid gap-4 sm:grid-cols-2">
              <Field label={t('calendar.absence.employee')} required error={errors.employeeId && t(errors.employeeId)}>
                {(id) => (
                  <Select
                    id={id}
                    name="absenceEmployee"
                    value={form.draft.employeeId}
                    onChange={(v) => set('employeeId', v)}
                    options={[{ value: '', label: t('calendar.project.selectEmployee') }, ...employees.filter((e) => e.status === 'active' || e.id === form.draft.employeeId).map((e) => ({ value: e.id, label: e.name }))]}
                  />
                )}
              </Field>
              <Field label={t('calendar.absence.type')}>
                {(id) => <Select id={id} value={form.draft.type} onChange={(v) => set('type', v)} options={enumOptions(t, 'absenceType')} />}
              </Field>
              <Field label={t('calendar.absence.startDate')} required error={errors.startDate && t(errors.startDate)}>
                {(id) => <Input id={id} name="absenceStart" type="date" value={form.draft.startDate} onChange={(e) => set('startDate', e.target.value)} />}
              </Field>
              <Field label={t('calendar.absence.endDate')} required error={errors.endDate && t(errors.endDate)}>
                {(id) => <Input id={id} name="absenceEnd" type="date" value={form.draft.endDate} onChange={(e) => set('endDate', e.target.value)} />}
              </Field>
            </div>
            <Field label={t('calendar.absence.note')}>
              {(id) => <Input id={id} value={form.draft.note} onChange={(e) => set('note', e.target.value)} />}
            </Field>
            <p className="text-xs text-slate-500">{t('calendar.businessDays', { count: businessDaysBetween(form.draft.startDate, form.draft.endDate) })}</p>
            {overlapping.length > 0 && (
              <p role="alert" className="flex items-center gap-1.5 text-sm text-amber-700 dark:text-amber-400">
                <AlertTriangle className="size-4" /> {t('calendar.toast.absenceOverlap', { count: overlapping.length })}
              </p>
            )}
            <div className="flex justify-end gap-2">
              {form.id && (
                <Button
                  variant="ghost"
                  icon={Trash2}
                  className="mr-auto text-red-600"
                  onClick={() => {
                    absenceService.remove(form.id!);
                    toast.success(t('calendar.toast.absenceDeleted'));
                    setForm(null);
                    if (editing) onClose();
                  }}
                >
                  {t('common.delete')}
                </Button>
              )}
              <Button onClick={() => (editing ? onClose() : setForm(null))}>{t('common.cancel')}</Button>
              <Button variant="primary" icon={Save} type="submit">
                {t('common.save')}
              </Button>
            </div>
          </form>
        ) : !canEdit ? null : (
          <Button variant="primary" icon={Plus} onClick={() => setForm({ draft: empty() })}>
            {t('calendar.absence.new')}
          </Button>
        )}

        <section>
          <h3 className="mb-2 text-sm font-semibold text-slate-700 dark:text-slate-300">{t('calendar.absence.list')}</h3>
          {list.length === 0 ? (
            <p className="text-sm text-slate-500">{t('calendar.absence.none')}</p>
          ) : (
            <ul className="divide-y divide-slate-100 rounded-lg border border-slate-200 dark:divide-slate-800 dark:border-slate-800">
              {list.map((a) => {
                const emp = empById.get(a.employeeId);
                return (
                  <li key={a.id} className="flex items-center gap-3 p-3 text-sm">
                    {emp && <Avatar name={emp.name} color={emp.color} size="sm" />}
                    <div className="min-w-0 flex-1">
                      <p className="font-medium">{emp?.name ?? '—'}</p>
                      <p className="text-xs text-slate-500">
                        {formatDate(a.startDate)} – {formatDate(a.endDate)} · {t('calendar.businessDays', { count: businessDaysBetween(a.startDate, a.endDate) })}
                        {a.note && ` · ${a.note}`}
                      </p>
                    </div>
                    <StatusBadge kind="absenceType" value={a.type} />
                    {canEdit && <Button size="sm" variant="ghost" icon={Pencil} onClick={() => { const { id, ...draft } = a; setForm({ id, draft }); }} aria-label={t('common.edit')} />}
                  </li>
                );
              })}
            </ul>
          )}
        </section>
      </div>
    </Drawer>
  );
}
