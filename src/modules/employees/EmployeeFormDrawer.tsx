import { useEffect, useMemo, useState, type FormEvent } from 'react';
import { CalendarClock, Check, Save } from 'lucide-react';
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
  upcomingOpenActivities,
  validateEmployee,
  type EmployeeDraft,
  type ValidationErrors,
} from '@/domain/employees';
import { ACTIVITY_STATUS, EMPLOYEE_COLORS, SERVICE_TYPE } from '@/domain/labels';
import { cn } from '@/lib/cn';
import { formatDateShort } from '@/lib/format';
import type { Employee } from '@/types/models';

interface Props {
  open: boolean;
  /** `undefined` = criação. */
  employee?: Employee;
  onClose: () => void;
}

export function EmployeeFormDrawer({ open, employee, onClose }: Props) {
  const employees = useCollection('employees');
  const activities = useCollection('activities');
  const toast = useToast();
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

  const set = <K extends keyof EmployeeDraft>(key: K, value: EmployeeDraft[K]) => {
    const next = { ...draft, [key]: value };
    setDraft(next);
    if (touched) setErrors(validateEmployee(next, employees, employee?.id));
  };

  const upcoming = employee ? upcomingOpenActivities(employee.id, activities) : [];
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
        toast.success(`Colaborador "${draft.name}" atualizado.`);
        if (employee.status === 'active' && draft.status === 'inactive' && upcoming.length) {
          toast.info(`${upcoming.length} atividade(s) futura(s) continuam atribuídas — reatribua na Agenda.`);
        }
      } else {
        employeeService.create(draft);
        toast.success(`Colaborador "${draft.name}" cadastrado.`);
      }
      onClose();
    } catch (err) {
      toast.error((err as Error).message);
    }
  };

  return (
    <Drawer
      open={open}
      onClose={onClose}
      title={isEdit ? 'Editar colaborador' : 'Novo colaborador'}
      subtitle={isEdit ? employee?.name : 'Cadastre um técnico, motorista ou engenheiro da equipe.'}
      footer={
        <>
          <Button onClick={onClose}>Cancelar</Button>
          <Button variant="primary" icon={Save} type="submit" form="employee-form">
            {isEdit ? 'Salvar alterações' : 'Cadastrar'}
          </Button>
        </>
      }
    >
      <form id="employee-form" onSubmit={submit} className="space-y-5" noValidate>
        {/* Preview */}
        <div className="flex items-center gap-3 rounded-lg border border-dashed border-slate-300 p-3 dark:border-slate-700">
          <Avatar name={draft.name || '?'} color={draft.color} size="lg" muted={draft.status === 'inactive'} />
          <div className="min-w-0">
            <p className="truncate font-semibold text-slate-900 dark:text-white">{draft.name || 'Nome do colaborador'}</p>
            <p className="truncate text-sm text-slate-500">{draft.role || 'Cargo / função'}</p>
          </div>
          <div className="ml-auto h-10 w-1.5 rounded-full" style={{ backgroundColor: draft.color }} />
        </div>

        <Field label="Nome completo" required error={errors.name}>
          {(id) => <Input id={id} value={draft.name} onChange={(e) => set('name', e.target.value)} invalid={!!errors.name} autoFocus placeholder="Ex.: Carlos Menezes" />}
        </Field>
        <Field label="Cargo / Função" required error={errors.role}>
          {(id) => <Input id={id} value={draft.role} onChange={(e) => set('role', e.target.value)} invalid={!!errors.role} placeholder="Ex.: Técnico de Campo" list="employee-roles" />}
        </Field>
        <datalist id="employee-roles">
          {[...new Set(employees.map((e) => e.role))].map((r) => (
            <option key={r} value={r} />
          ))}
        </datalist>

        <div className="grid gap-4 sm:grid-cols-2">
          <Field label="Telefone" error={errors.phone}>
            {(id) => <Input id={id} type="tel" inputMode="tel" value={draft.phone} onChange={(e) => set('phone', maskPhone(e.target.value))} invalid={!!errors.phone} placeholder="(19) 99999-0000" />}
          </Field>
          <Field label="E-mail" error={errors.email}>
            {(id) => <Input id={id} type="email" value={draft.email} onChange={(e) => set('email', e.target.value)} invalid={!!errors.email} placeholder="nome@empresa.com.br" />}
          </Field>
        </div>

        <Field label="Cor no calendário" error={errors.color} hint={colorTakenBy ? `Atenção: cor já usada por ${colorTakenBy.name}.` : 'Identifica as atividades deste colaborador na agenda.'}>
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
                      aria-label={`Cor ${c}`}
                      aria-pressed={selected}
                    >
                      {selected && <Check className="size-4 text-white" strokeWidth={3} />}
                    </button>
                  );
                })}
              </div>
              <div className="flex items-center gap-2">
                <input type="color" value={draft.color} onChange={(e) => set('color', e.target.value)} className="h-9 w-12 cursor-pointer rounded border border-slate-300 bg-transparent dark:border-slate-700" aria-label="Cor personalizada" />
                <Input id={id} value={draft.color} onChange={(e) => set('color', e.target.value)} className="w-32 font-mono uppercase" maxLength={7} invalid={!!errors.color} />
              </div>
            </div>
          )}
        </Field>

        <Field label="Status">
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
                  <span className="font-medium">{s === 'active' ? 'Ativo' : 'Inativo'}</span>
                  <span className="block text-xs text-slate-500">{s === 'active' ? 'Disponível para agendamentos' : 'Oculto em novos agendamentos; histórico preservado'}</span>
                </button>
              ))}
            </div>
          )}
        </Field>

        {isEdit && (
          <section className="rounded-lg border border-slate-200 dark:border-slate-800">
            <h3 className="flex items-center gap-2 border-b border-slate-200 px-3 py-2 text-sm font-semibold dark:border-slate-800">
              <CalendarClock className="size-4 text-slate-400" />
              Próximas atividades
              <Badge className="ml-auto">{upcoming.length}</Badge>
            </h3>
            {upcoming.length === 0 ? (
              <p className="px-3 py-4 text-sm text-slate-500">Nenhuma atividade futura em aberto.</p>
            ) : (
              <ul className="max-h-60 divide-y divide-slate-100 overflow-y-auto dark:divide-slate-800">
                {upcoming.slice(0, 15).map((a) => (
                  <li key={a.id} className="flex items-center gap-3 px-3 py-2 text-sm">
                    <span className="w-24 shrink-0 text-xs text-slate-500">{formatDateShort(a.date)}</span>
                    <span className="w-24 shrink-0 font-mono text-xs text-slate-500">
                      {a.startTime}–{a.endTime}
                    </span>
                    <span className="min-w-0 flex-1 truncate" title={a.description}>
                      <span className="font-medium">{a.customer}</span>
                      <span className="text-slate-500"> · {SERVICE_TYPE[a.serviceType].label}</span>
                    </span>
                    <StatusBadge map={ACTIVITY_STATUS} value={a.status} />
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
