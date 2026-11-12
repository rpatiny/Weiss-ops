import { useEffect, useMemo, useState, type FormEvent } from 'react';
import { CalendarClock, Check, Palmtree, Save } from 'lucide-react';
import { Badge, StatusBadge } from '@/components/ui/Badge';
import { Button } from '@/components/ui/Button';
import { Drawer } from '@/components/ui/Drawer';
import { Field, Input } from '@/components/ui/Field';
import { Avatar } from '@/components/ui/misc';
import { useToast } from '@/components/ui/Toast';
import { useCollection } from '@/data/hooks';
import {
  emptyEmployee,
  employeeService,
  maskPhone,
  upcomingAbsences,
  upcomingAssignments,
  validateEmployee,
  type EmployeeDraft,
  type ValidationErrors,
} from '@/domain/employees';
import { EMPLOYEE_COLORS, enumLabel } from '@/domain/labels';
import { businessDaysBetween } from '@/lib/dates';
import { useI18n } from '@/i18n';
import { cn } from '@/lib/cn';
import { formatDate } from '@/lib/format';
import type { Employee } from '@/types/models';

interface Props {
  open: boolean;
  /** `undefined` = criação. */
  employee?: Employee;
  onClose: () => void;
}

export function EmployeeFormDrawer({ open, employee, onClose }: Props) {
  const employees = useCollection('employees');
  const assignments = useCollection('assignments');
  const projects = useCollection('projects');
  const absences = useCollection('absences');
  const toast = useToast();
  const { t, locale } = useI18n();
  const isEdit = Boolean(employee);

  const nextFreeColor = useMemo(() => {
    const used = new Set(employees.map((e) => e.color.toLowerCase()));
    return EMPLOYEE_COLORS.find((c) => !used.has(c)) ?? EMPLOYEE_COLORS[0]!;
  }, [employees]);

  const [draft, setDraft] = useState<EmployeeDraft>(emptyEmployee());
  const [errors, setErrors] = useState<ValidationErrors<EmployeeDraft>>({});
  const [touched, setTouched] = useState(false);

  // Reinicializa o formulário ao abrir.
  useEffect(() => {
    if (!open) return;
    if (employee) {
      const { id: _id, ...rest } = employee;
      setDraft(rest);
    } else {
      setDraft(emptyEmployee(nextFreeColor));
    }
    setErrors({});
    setTouched(false);
  }, [open, employee?.id]);

  const err = (k: keyof EmployeeDraft) => {
    const key = errors[k];
    return key ? t(key) : undefined;
  };

  const set = <K extends keyof EmployeeDraft>(key: K, value: EmployeeDraft[K]) => {
    const next = { ...draft, [key]: value };
    setDraft(next);
    if (touched) setErrors(validateEmployee(next, employees, employee?.id));
  };

  const upcoming = employee ? upcomingAssignments(employee.id, assignments) : [];
  const empAbsences = employee ? upcomingAbsences(employee.id, absences) : [];
  const colorTakenBy = employees.find((e) => e.id !== employee?.id && e.color.toLowerCase() === draft.color.toLowerCase());

  const submit = (ev: FormEvent) => {
    ev.preventDefault();
    setTouched(true);
    const errs = validateEmployee(draft, employees, employee?.id);
    setErrors(errs);
    if (Object.keys(errs).length) return;
    try {
      if (employee) {
        employeeService.update(employee.id, draft);
        toast.success(t('employees.toast.updated', { name: draft.name }));
        if (employee.status === 'active' && draft.status === 'inactive' && upcoming.length) {
          toast.info(t('employees.toast.upcomingWarning', { count: upcoming.length }));
        }
      } else {
        employeeService.create(draft);
        toast.success(t('employees.toast.created', { name: draft.name }));
      }
      onClose();
    } catch (e) {
      toast.error((e as Error).message);
    }
  };

  return (
    <Drawer
      open={open}
      onClose={onClose}
      title={isEdit ? t('employees.form.editTitle') : t('employees.form.newTitle')}
      subtitle={isEdit ? employee?.name : t('employees.form.newSubtitle')}
      footer={
        <>
          <Button onClick={onClose}>{t('common.cancel')}</Button>
          <Button variant="primary" icon={Save} type="submit" form="employee-form">
            {isEdit ? t('employees.form.submitSave') : t('employees.form.submitCreate')}
          </Button>
        </>
      }
    >
      <form id="employee-form" onSubmit={submit} className="space-y-5" noValidate>
        <div className="flex items-center gap-3 rounded-lg border border-dashed border-slate-300 p-3 dark:border-slate-700">
          <Avatar name={draft.name || '?'} color={draft.color} size="lg" muted={draft.status === 'inactive'} />
          <div className="min-w-0">
            <p className="truncate font-semibold text-slate-900 dark:text-white">{draft.name || t('employees.form.previewName')}</p>
            <p className="truncate text-sm text-slate-500">{draft.role || t('employees.form.previewRole')}</p>
          </div>
          <div className="ml-auto h-10 w-1.5 rounded-full" style={{ backgroundColor: draft.color }} />
        </div>

        <Field label={t('employees.form.name')} required error={err('name')}>
          {(id) => (
            <Input id={id} name="name" value={draft.name} onChange={(e) => set('name', e.target.value)} invalid={!!errors.name} autoFocus placeholder={t('employees.form.namePlaceholder')} />
          )}
        </Field>
        <Field label={t('employees.form.role')} required error={err('role')}>
          {(id) => (
            <Input id={id} name="role" value={draft.role} onChange={(e) => set('role', e.target.value)} invalid={!!errors.role} placeholder={t('employees.form.rolePlaceholder')} list="employee-roles" />
          )}
        </Field>
        <datalist id="employee-roles">
          {[...new Set(employees.map((e) => e.role))].map((r) => (
            <option key={r} value={r} />
          ))}
        </datalist>

        <div className="grid gap-4 sm:grid-cols-2">
          <Field label={t('employees.form.phone')} error={err('phone')}>
            {(id) => (
              <Input
                id={id}
                name="phone"
                type="tel"
                inputMode="tel"
                value={draft.phone}
                onChange={(e) => set('phone', locale === 'pt-BR' ? maskPhone(e.target.value) : e.target.value)}
                invalid={!!errors.phone}
                placeholder={locale === 'pt-BR' ? '(19) 99999-0000' : '+1 555 123 4567'}
              />
            )}
          </Field>
          <Field label={t('employees.form.email')} error={err('email')}>
            {(id) => <Input id={id} name="email" type="email" value={draft.email} onChange={(e) => set('email', e.target.value)} invalid={!!errors.email} placeholder="name@company.com" />}
          </Field>
        </div>

        <Field
          label={t('employees.form.color')}
          error={err('color')}
          hint={colorTakenBy ? t('employees.form.colorTaken', { name: colorTakenBy.name }) : t('employees.form.colorHint')}
        >
          {(id) => (
            <div className="space-y-3">
              <div className="flex flex-wrap gap-2">
                {EMPLOYEE_COLORS.map((c) => {
                  const selected = draft.color.toLowerCase() === c;
                  return (
                    <button
                      key={c}
                      type="button"
                      onClick={() => set('color', c)}
                      className={cn('flex size-8 items-center justify-center rounded-full ring-offset-2 transition dark:ring-offset-slate-900', selected ? 'ring-2 ring-slate-900 dark:ring-white' : 'hover:scale-110')}
                      style={{ backgroundColor: c }}
                      aria-label={c}
                      aria-pressed={selected}
                    >
                      {selected && <Check className="size-4 text-white" strokeWidth={3} />}
                    </button>
                  );
                })}
              </div>
              <div className="flex items-center gap-2">
                <input type="color" value={draft.color} onChange={(e) => set('color', e.target.value)} className="h-9 w-12 cursor-pointer rounded border border-slate-300 bg-transparent dark:border-slate-700" aria-label={t('employees.form.customColor')} />
                <Input id={id} value={draft.color} onChange={(e) => set('color', e.target.value)} className="w-32 font-mono uppercase" maxLength={7} invalid={!!errors.color} />
              </div>
            </div>
          )}
        </Field>

        <Field label={t('common.status')}>
          {() => (
            <div className="grid grid-cols-2 gap-2">
              {(['active', 'inactive'] as const).map((s) => (
                <button
                  key={s}
                  type="button"
                  onClick={() => set('status', s)}
                  className={cn(
                    'rounded-lg border px-3 py-2 text-left text-sm transition',
                    draft.status === s
                      ? 'border-brand-500 bg-brand-50 ring-1 ring-brand-500 dark:bg-brand-500/10'
                      : 'border-slate-300 hover:bg-slate-50 dark:border-slate-700 dark:hover:bg-slate-800',
                  )}
                >
                  <span className="font-medium">{enumLabel(t, 'employeeStatus', s)}</span>
                  <span className="block text-xs text-slate-500">{s === 'active' ? t('employees.form.activeHint') : t('employees.form.inactiveHint')}</span>
                </button>
              ))}
            </div>
          )}
        </Field>

        {isEdit && (
          <section className="rounded-lg border border-slate-200 dark:border-slate-800">
            <h3 className="flex items-center gap-2 border-b border-slate-200 px-3 py-2 text-sm font-semibold dark:border-slate-800">
              <CalendarClock className="size-4 text-slate-400" />
              {t('employees.form.upcomingTitle')}
              <Badge className="ml-auto">{upcoming.length}</Badge>
            </h3>
            {upcoming.length === 0 ? (
              <p className="px-3 py-4 text-sm text-slate-500">{t('employees.form.noUpcoming')}</p>
            ) : (
              <ul className="max-h-60 divide-y divide-slate-100 overflow-y-auto dark:divide-slate-800">
                {upcoming.slice(0, 15).map((a) => {
                  const p = projects.find((x) => x.id === a.projectId);
                  return (
                    <li key={a.id}>
                      <a href={`#/calendar?open=${a.projectId}`} className="flex items-center gap-3 px-3 py-2 text-sm hover:bg-slate-50 dark:hover:bg-slate-800/50">
                        <span className="h-8 w-1 shrink-0 rounded-full" style={{ backgroundColor: p?.color ?? '#64748b' }} />
                        <span className="min-w-0 flex-1">
                          <span className="block truncate font-medium">
                            <span className="font-mono text-xs text-slate-500">{p?.projectNumber}</span> {p?.customer}
                          </span>
                          <span className="text-xs text-slate-500">
                            {formatDate(a.startDate)} – {formatDate(a.endDate)} · {t('calendar.businessDays', { count: businessDaysBetween(a.startDate, a.endDate) })}
                          </span>
                        </span>
                        {p && <StatusBadge kind="projectStatus" value={p.status} />}
                      </a>
                    </li>
                  );
                })}
              </ul>
            )}
          </section>
        )}

        {isEdit && (
          <section className="rounded-lg border border-slate-200 dark:border-slate-800">
            <h3 className="flex items-center gap-2 border-b border-slate-200 px-3 py-2 text-sm font-semibold dark:border-slate-800">
              <Palmtree className="size-4 text-slate-400" />
              {t('employees.form.absencesTitle')}
              <Badge className="ml-auto">{empAbsences.length}</Badge>
            </h3>
            {empAbsences.length === 0 ? (
              <p className="px-3 py-4 text-sm text-slate-500">{t('employees.form.noAbsences')}</p>
            ) : (
              <ul className="divide-y divide-slate-100 dark:divide-slate-800">
                {empAbsences.map((x) => (
                  <li key={x.id} className="flex items-center gap-3 px-3 py-2 text-sm">
                    <StatusBadge kind="absenceType" value={x.type} />
                    <span>
                      {formatDate(x.startDate)} – {formatDate(x.endDate)}
                    </span>
                    {x.note && <span className="truncate text-xs text-slate-500">{x.note}</span>}
                  </li>
                ))}
              </ul>
            )}
          </section>
        )}
      </form>
    </Drawer>
  );
}
