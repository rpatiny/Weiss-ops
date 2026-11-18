import { useEffect, useMemo, useState, type FormEvent } from 'react';
import { AlertTriangle, Check, ExternalLink, Lock, MapPin, Plus, Save, Trash2, UserPlus } from 'lucide-react';
import { navigate } from '@/app/router';
import { useCan } from '@/app/session';
import { Button } from '@/components/ui/Button';
import { Drawer } from '@/components/ui/Drawer';
import { Field, Input, Select, Textarea } from '@/components/ui/Field';
import { ConfirmDialog } from '@/components/ui/Modal';
import { ProtectedInput } from '@/components/ui/ProtectedInput';
import { deliveryAddressOf, findClientByName, formatAddress } from '@/domain/clients';
import { DeliverTo } from '@/modules/customers/CustomersPage';
import { APP_CONFIG } from '@/lib/config';
import { Avatar } from '@/components/ui/misc';
import { useToast } from '@/components/ui/Toast';
import { useCollection } from '@/data/hooks';
import { enumOptions } from '@/domain/labels';
import {
  checkPlacement,
  findConflicts,
  findSpindleByRef,
  nextProjectColor,
  nextProjectNumber,
  PROJECT_COLORS,
  projectPoRef,
  projectSpindleRef,
  scheduleService,
  validateProject,
  type Errors,
  type ProjectDraft,
} from '@/domain/schedule';
import { useI18n } from '@/i18n';
import { cn } from '@/lib/cn';
import { addBusinessDays, businessDaysBetween, snapBackward, snapForward, todayISO } from '@/lib/dates';
import { formatDate } from '@/lib/format';
import type { ProjectAssignment } from '@/types/models';
import { MaterialsTab } from './MaterialsTab';
import { CustomerReportTab } from '@/modules/portal/CustomerReportTab';
import { ProjectHistoryTab } from './ProjectHistoryTab';

export type ProjectTab = 'details' | 'team' | 'materials' | 'report' | 'history';

interface Props {
  open: boolean;
  projectId?: string;
  initialTab?: ProjectTab;
  /** Para criação: colaborador/data clicados no cronograma. */
  defaults?: { employeeId?: string; date?: string };
  onClose: () => void;
}

const emptyDraft = (): ProjectDraft => ({
  projectNumber: '',
  customer: '',
  address: '',
  serviceType: 'bench_repair',
  description: '',
  status: 'planned',
  color: PROJECT_COLORS[0]!,
});

export function ProjectDrawer({ open, projectId: initialId, initialTab = 'details', defaults, onClose }: Props) {
  const { t } = useI18n();
  const toast = useToast();
  const allowedTo = useCan();
  const readOnly = !allowedTo('schedule.edit');
  const canReviewPortal = allowedTo('portal.review');
  const projectUpdates = useCollection('projectUpdates');
  const pendingReport = projectUpdates.filter((u) => u.projectId === initialId && u.status === 'pending').length;
  const projects = useCollection('projects');
  const assignments = useCollection('assignments');
  const employees = useCollection('employees');
  const absences = useCollection('absences');
  const purchaseOrders = useCollection('purchaseOrders');
  const spindles = useCollection('spindles');

  const [projectId, setProjectId] = useState<string | undefined>(initialId);
  const [tab, setTab] = useState<ProjectTab>(initialTab);
  const [draft, setDraft] = useState<ProjectDraft>(emptyDraft());
  const [errors, setErrors] = useState<Errors<ProjectDraft>>({});
  const [first, setFirst] = useState({ employeeId: '', startDate: '', endDate: '' });
  const [firstError, setFirstError] = useState<string>();
  const [confirmDelete, setConfirmDelete] = useState(false);

  const project = projects.find((p) => p.id === projectId);

  useEffect(() => {
    if (!open) return;
    setProjectId(initialId);
    setTab(initialId ? initialTab : 'details');
    setErrors({});
    setFirstError(undefined);
    const p = projects.find((x) => x.id === initialId);
    if (p) {
      const { id: _id, materials: _m, ...rest } = p;
      setDraft({
        ...rest,
        customerPoRef: p.customerPoRef ?? projectPoRef(p, new Map(purchaseOrders.map((x) => [x.id, x]))),
        spindleRef: projectSpindleRef(p, new Map(spindles.map((x) => [x.id, x]))),
      });
    } else {
      setDraft({ ...emptyDraft(), projectNumber: nextProjectNumber(projects), color: nextProjectColor(projects) });
      const start = snapForward(defaults?.date ?? todayISO());
      setFirst({ employeeId: defaults?.employeeId ?? '', startDate: start, endDate: addBusinessDays(start, 4) });
    }
  }, [open, initialId, initialTab]);

  const projAssignments = useMemo(
    () => assignments.filter((a) => a.projectId === projectId).sort((a, b) => a.startDate.localeCompare(b.startDate)),
    [assignments, projectId],
  );
  const projectStart = projAssignments[0]?.startDate;
  const conflicts = useMemo(() => findConflicts(assignments, new Map(projects.map((p) => [p.id, p]))), [assignments, projects]);

  // Cliente vem do cadastro único; endereço do serviço sugerido = endereço de ENTREGA do cliente.
  const clients = useCollection('clients');
  const knownCustomers = useMemo(() => new Map(clients.map((c) => [c.name, formatAddress(deliveryAddressOf(c))])), [clients]);
  const client = findClientByName(draft.customer, clients);

  const set = <K extends keyof ProjectDraft>(k: K, v: ProjectDraft[K]) => {
    const next = { ...draft, [k]: v };
    if (k === 'customer' && !draft.address.trim()) next.address = knownCustomers.get(String(v)) ?? '';
    if (k === 'spindleRef') {
      const sp = findSpindleByRef(String(v ?? ''), spindles);
      if (sp && !draft.customer.trim()) {
        next.customer = sp.customer;
        next.address = draft.address || (knownCustomers.get(sp.customer) ?? '');
      }
    }
    setDraft(next);
  };

  const linkedSpindle = findSpindleByRef(draft.spindleRef, spindles);

  const activeEmployees = employees.filter((e) => e.status === 'active').sort((a, b) => a.name.localeCompare(b.name));
  const empOptions = [{ value: '', label: t('calendar.project.selectEmployee') }, ...activeEmployees.map((e) => ({ value: e.id, label: e.name }))];

  const placementMsg = (err: ReturnType<typeof checkPlacement>) =>
    err === 'absence'
      ? t('calendar.validation.blockedAbsence')
      : err === 'inactive'
        ? t('calendar.validation.employeeInactive')
        : err === 'order'
          ? t('calendar.validation.dateOrder')
          : err === 'projectTaken'
            ? t('calendar.validation.projectTaken')
            : err === 'employeeBusy'
              ? t('calendar.validation.employeeBusy')
              : undefined;

  const submit = (e: FormEvent) => {
    e.preventDefault();
    const errs = validateProject(draft, projects, projectId);
    if (!errs.customer && !findClientByName(draft.customer, clients)) errs.customer = 'clients.validation.notRegistered';
    setErrors(errs);
    if (Object.keys(errs).length) {
      setTab('details');
      return;
    }
    if (project) {
      scheduleService.updateProject(project.id, draft);
      toast.success(t('calendar.toast.updated'));
      onClose();
      return;
    }
    // Criação: primeira alocação opcional, mas se informada deve ser válida.
    let firstAssignment;
    if (first.employeeId) {
      const s = snapForward(first.startDate);
      const en = snapBackward(first.endDate);
      const err = checkPlacement(employees.find((x) => x.id === first.employeeId), s, en, absences, undefined, { projectId: '__new__', assignments });
      if (err) {
        setFirstError(placementMsg(err));
        return;
      }
      firstAssignment = { employeeId: first.employeeId, startDate: s, endDate: en };
    }
    const created = scheduleService.createProject(draft, firstAssignment);
    toast.success(t('calendar.toast.created'));
    // Mantém o drawer aberto para cadastrar materiais/equipe.
    setProjectId(created.id);
    setTab('materials');
  };

  const remove = () => {
    if (!project) return;
    scheduleService.removeProject(project.id);
    toast.success(t('calendar.toast.deleted'));
    setConfirmDelete(false);
    onClose();
  };

  const mapsUrl = draft.address.trim() ? `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(draft.address.trim())}` : '';

  const tabs: { id: ProjectTab; label: string; disabled?: boolean; count?: number }[] = [
    { id: 'details', label: t('calendar.project.tabs.details') },
    { id: 'team', label: t('calendar.project.tabs.team'), disabled: !project, count: projAssignments.length },
    { id: 'materials', label: t('calendar.project.tabs.materials'), disabled: !project, count: project?.materials.length },
    // Relatório do cliente (Office/Master revisam e aprovam o que o cliente vê).
    ...(canReviewPortal ? [{ id: 'report' as const, label: t('portal.tab'), disabled: !project, count: pendingReport || undefined }] : []),
    // Histórico de mudanças: só Master.
    ...(allowedTo('audit.view') ? [{ id: 'history' as const, label: t('audit.tab'), disabled: !project }] : []),
  ];

  return (
    <>
      <Drawer
        open={open}
        onClose={onClose}
        width="lg"
        title={
          project ? (
            <span className="flex items-center gap-2">
              <span className="size-3 rounded-full" style={{ backgroundColor: draft.color }} />
              {t('calendar.project.editTitle', { number: project.projectNumber })}
            </span>
          ) : (
            t('calendar.project.newTitle')
          )
        }
        subtitle={project ? project.customer : undefined}
        footer={
          tab === 'details' && !readOnly ? (
            <>
              {project && (
                <Button variant="ghost" icon={Trash2} className="mr-auto text-red-600" onClick={() => setConfirmDelete(true)}>
                  {t('common.delete')}
                </Button>
              )}
              <Button onClick={onClose}>{t('common.cancel')}</Button>
              <Button variant="primary" icon={Save} type="submit" form="project-form">
                {project ? t('calendar.project.submitSave') : t('calendar.project.submitCreate')}
              </Button>
            </>
          ) : (
            <Button onClick={onClose}>{t('common.close')}</Button>
          )
        }
      >
        {/* Abas */}
        <div className="-mt-1 mb-5 flex gap-1 overflow-x-auto border-b border-slate-200 dark:border-slate-800" role="tablist">
          {tabs.map((x) => (
            <button
              key={x.id}
              role="tab"
              aria-selected={tab === x.id}
              disabled={x.disabled}
              title={x.disabled ? t('calendar.project.saveFirst') : undefined}
              onClick={() => setTab(x.id)}
              className={cn(
                '-mb-px flex shrink-0 items-center gap-1.5 border-b-2 px-3 py-2 text-sm font-medium whitespace-nowrap transition-colors disabled:cursor-not-allowed disabled:opacity-40',
                tab === x.id ? 'border-brand-500 text-slate-900 dark:text-white' : 'border-transparent text-slate-500 hover:text-slate-800 dark:hover:text-slate-200',
              )}
            >
              {x.label}
              {x.count !== undefined && <span className="rounded-full bg-slate-100 px-1.5 text-[11px] dark:bg-slate-800">{x.count}</span>}
            </button>
          ))}
        </div>

        {tab === 'details' && (
          <form id="project-form" onSubmit={submit} className="space-y-5" noValidate>
            <fieldset disabled={readOnly} className="space-y-5">
            <div className="grid gap-4 sm:grid-cols-2">
              <Field label={t('calendar.project.number')} required error={errors.projectNumber && t(errors.projectNumber)}>
                {(id) => <ProtectedInput protect={!!project} resetKey={project?.id} fieldLabel={t('calendar.project.number')} id={id} name="projectNumber" value={draft.projectNumber} onChange={(e) => set('projectNumber', e.target.value)} className="font-mono" invalid={!!errors.projectNumber} />}
              </Field>
              <Field label={t('calendar.project.customer')} required error={errors.customer && t(errors.customer)}>
                {(id) => <ProtectedInput protect={!!project} resetKey={project?.id} fieldLabel={t('calendar.project.customer')} id={id} name="customer" value={draft.customer} onChange={(e) => set('customer', e.target.value)} list="project-customers" placeholder={t('calendar.project.customerPlaceholder')} invalid={!!errors.customer} autoFocus={!project} />}
              </Field>
            </div>
            {client && <DeliverTo client={client} compact />}
            <datalist id="project-customers">
              {[...knownCustomers.keys()].sort().map((c) => (
                <option key={c} value={c} />
              ))}
            </datalist>
            <Field label={t('calendar.project.address')}>
              {(id) => (
                <div className="flex gap-2">
                  <Input id={id} name="address" value={draft.address} onChange={(e) => set('address', e.target.value)} placeholder={t('calendar.project.addressPlaceholder')} />
                  {mapsUrl && (
                    <a href={mapsUrl} target="_blank" rel="noopener noreferrer" className="inline-flex h-9 shrink-0 items-center gap-1.5 rounded-lg border border-slate-300 px-3 text-sm hover:bg-slate-50 dark:border-slate-700 dark:hover:bg-slate-800" title={t('calendar.openMaps')}>
                      <MapPin className="size-4" />
                      <span className="hidden sm:inline">Maps</span>
                    </a>
                  )}
                </div>
              )}
            </Field>
            <div className="grid gap-4 sm:grid-cols-2">
              <Field label={t('calendar.project.serviceType')}>
                {(id) => <Select id={id} value={draft.serviceType} onChange={(v) => set('serviceType', v)} options={enumOptions(t, 'serviceType')} />}
              </Field>
              <Field label={t('common.status')}>
                {(id) => <Select id={id} value={draft.status} onChange={(v) => set('status', v)} options={enumOptions(t, 'projectStatus')} />}
              </Field>
            </div>
            <Field label={t('calendar.project.description')}>
              {(id) => <Textarea id={id} rows={2} value={draft.description} onChange={(e) => set('description', e.target.value)} />}
            </Field>
            <Field label={t('calendar.project.color')}>
              {() => (
                <div className="flex flex-wrap gap-2">
                  {PROJECT_COLORS.map((c) => (
                    <button key={c} type="button" onClick={() => set('color', c)} className={cn('flex size-7 items-center justify-center rounded-md ring-offset-2 dark:ring-offset-slate-900', draft.color === c && 'ring-2 ring-slate-900 dark:ring-white')} style={{ backgroundColor: c }} aria-label={c} aria-pressed={draft.color === c}>
                      {draft.color === c && <Check className="size-4 text-white" strokeWidth={3} />}
                    </button>
                  ))}
                </div>
              )}
            </Field>
            {/* PO do cliente: UMA por projeto. Número, data e valor travados — editar exige confirmação. */}
            <fieldset className="space-y-3 rounded-lg border border-slate-200 p-4 dark:border-slate-800">
              <legend className="px-1 text-sm font-semibold text-slate-700 dark:text-slate-200">{t('calendar.project.customerPoTitle')}</legend>
              <div className="grid gap-3 sm:grid-cols-3">
                <Field label={t('calendar.project.customerPoNumber')}>
                  {(id) => <ProtectedInput protect={!!project?.customerPoRef} resetKey={project?.id} fieldLabel={t('calendar.project.customerPoNumber')} id={id} name="customerPoRef" className="font-mono" autoComplete="off" value={draft.customerPoRef ?? ''} onChange={(e) => set('customerPoRef', e.target.value)} />}
                </Field>
                <Field label={t('calendar.project.customerPoDate')}>
                  {(id) => <ProtectedInput protect={!!project?.customerPoDate} resetKey={project?.id} fieldLabel={t('calendar.project.customerPoDate')} id={id} type="date" value={draft.customerPoDate ?? ''} onChange={(e) => set('customerPoDate', e.target.value || undefined)} />}
                </Field>
                <Field label={t('calendar.project.customerPoValue', { currency: APP_CONFIG.currency })}>
                  {(id) => (
                    <ProtectedInput
                      protect={project?.customerPoValue !== undefined}
                      resetKey={project?.id}
                      fieldLabel={t('calendar.project.customerPoValue', { currency: APP_CONFIG.currency })}
                      id={id}
                      type="number"
                      min={0}
                      step="0.01"
                      className="text-right tabular-nums"
                      value={draft.customerPoValue ?? ''}
                      onChange={(e) => set('customerPoValue', e.target.value === '' ? undefined : Number(e.target.value))}
                    />
                  )}
                </Field>
              </div>
            </fieldset>
            <div className="grid gap-4 sm:grid-cols-2">
              <Field label={t('calendar.project.linkSpindle')}>
                {(id) => (
                  <div className="flex gap-2">
                    <div className="min-w-0 flex-1"><ProtectedInput protect={!!project && !!(project.spindleRef?.trim() || project.spindleId)} resetKey={project?.id} fieldLabel={t('calendar.project.linkSpindle')} id={id} name="spindleRef" value={draft.spindleRef ?? ''} onChange={(e) => set('spindleRef', e.target.value)} list="project-spindle-refs" autoComplete="off" /></div>
                    {linkedSpindle && <Button icon={ExternalLink} onClick={() => navigate('/financial', { open: linkedSpindle.id })} aria-label="Spindle" />}
                  </div>
                )}
              </Field>
              <datalist id="project-spindle-refs">
                {spindles.map((s) => (
                  <option key={s.id} value={s.serialNumber}>{`${s.manufacturer} ${s.model} — ${s.customer}`}</option>
                ))}
              </datalist>
            </div>

            {!project && (
              <fieldset className="space-y-4 rounded-lg border border-slate-200 p-4 dark:border-slate-800">
                <legend className="px-1 text-sm font-semibold">{t('calendar.project.firstAssignment')}</legend>
                <div className="grid gap-4 sm:grid-cols-3">
                  <Field label={t('calendar.project.employee')}>
                    {(id) => <Select id={id} name="firstEmployee" value={first.employeeId} onChange={(v) => setFirst({ ...first, employeeId: v })} options={empOptions} />}
                  </Field>
                  <Field label={t('calendar.project.startDate')}>
                    {(id) => <Input id={id} name="firstStart" type="date" value={first.startDate} onChange={(e) => setFirst({ ...first, startDate: e.target.value })} />}
                  </Field>
                  <Field label={t('calendar.project.endDate')}>
                    {(id) => <Input id={id} name="firstEnd" type="date" value={first.endDate} onChange={(e) => setFirst({ ...first, endDate: e.target.value })} />}
                  </Field>
                </div>
                <p className="text-xs text-slate-500">{first.startDate && first.endDate && t('calendar.businessDays', { count: businessDaysBetween(snapForward(first.startDate), snapBackward(first.endDate)) })}</p>
                {firstError && (
                  <p role="alert" className="flex items-center gap-1.5 text-sm text-red-600">
                    <Lock className="size-4" /> {firstError}
                  </p>
                )}
              </fieldset>
            )}
            </fieldset>
          </form>
        )}

        {tab === 'team' && project && (
          <fieldset disabled={readOnly}>
            <TeamTab projectId={project.id} items={projAssignments} conflicts={conflicts} placementMsg={placementMsg} />
          </fieldset>
        )}

        {tab === 'materials' && project && <MaterialsTab project={project} projectStart={projectStart} />}
        {tab === 'report' && project && canReviewPortal && <CustomerReportTab project={project} />}
        {tab === 'history' && project && allowedTo('audit.view') && <ProjectHistoryTab project={project} />}
      </Drawer>

      <ConfirmDialog
        open={confirmDelete}
        title={t('calendar.project.deleteTitle')}
        message={t('calendar.project.deleteMessage', { number: project?.projectNumber ?? '' })}
        confirmLabel={t('common.delete')}
        onConfirm={remove}
        onCancel={() => setConfirmDelete(false)}
      />
    </>
  );
}

function TeamTab({
  projectId,
  items,
  conflicts,
  placementMsg,
}: {
  projectId: string;
  items: ProjectAssignment[];
  conflicts: ReadonlyMap<string, string[]>;
  placementMsg: (err: ReturnType<typeof checkPlacement>) => string | undefined;
}) {
  const { t } = useI18n();
  const toast = useToast();
  const employees = useCollection('employees');
  const absences = useCollection('absences');
  const allAssignments = useCollection('assignments');
  const empById = new Map(employees.map((e) => [e.id, e]));
  const start0 = snapForward(items.at(-1)?.endDate ?? todayISO());
  const [add, setAdd] = useState({ employeeId: '', startDate: start0, endDate: addBusinessDays(start0, 2) });
  const [error, setError] = useState<string>();
  const [rowError, setRowError] = useState<Record<string, string>>({});

  const update = (a: ProjectAssignment, patch: Partial<ProjectAssignment>) => {
    const next = { ...a, ...patch };
    const s = snapForward(next.startDate);
    const e = snapBackward(next.endDate);
    const err = checkPlacement(empById.get(next.employeeId), s, e, absences, a.employeeId, { projectId, assignments: allAssignments, selfId: a.id });
    if (err) {
      setRowError({ ...rowError, [a.id]: placementMsg(err) ?? '' });
      return;
    }
    setRowError({ ...rowError, [a.id]: '' });
    scheduleService.updateAssignment(a.id, { employeeId: next.employeeId, startDate: s, endDate: e });
  };

  const addAssignment = () => {
    if (!add.employeeId) {
      setError(t('calendar.validation.employeeRequired'));
      return;
    }
    const s = snapForward(add.startDate);
    const e = snapBackward(add.endDate);
    const err = checkPlacement(empById.get(add.employeeId), s, e, absences, undefined, { projectId, assignments: allAssignments });
    if (err) {
      setError(placementMsg(err));
      return;
    }
    scheduleService.addAssignment(projectId, { employeeId: add.employeeId, startDate: s, endDate: e });
    toast.success(t('calendar.toast.assignmentAdded'));
    setError(undefined);
    setAdd({ ...add, employeeId: '' });
  };

  const active = employees.filter((e) => e.status === 'active').sort((a, b) => a.name.localeCompare(b.name));

  return (
    <div className="space-y-4">
      {items.length === 0 ? (
        <p className="rounded-lg border border-dashed border-slate-300 p-6 text-center text-sm text-slate-500 dark:border-slate-700">{t('calendar.project.noAssignments')}</p>
      ) : (
        <ul className="space-y-2">
          {items.map((a) => {
            const emp = empById.get(a.employeeId);
            const conflict = conflicts.has(a.id);
            return (
              <li key={a.id} className={cn('rounded-lg border p-3', conflict ? 'border-red-400 bg-red-50/50 dark:border-red-800 dark:bg-red-950/20' : 'border-slate-200 dark:border-slate-800')}>
                {/* 1) avatar + colaborador + excluir · 2) início | fim · 3) resumo — mesma grade no celular e no desktop */}
                <div className="flex items-center gap-3">
                  {emp && <Avatar name={emp.name} color={emp.color} size="sm" muted={emp.status === 'inactive'} />}
                  <Select
                    className="min-w-0 flex-1"
                    value={a.employeeId}
                    onChange={(v) => update(a, { employeeId: v })}
                    options={[...active, ...(emp && emp.status === 'inactive' ? [emp] : [])].map((e) => ({ value: e.id, label: e.status === 'inactive' ? `${e.name} ${t('calendar.project.inactiveSuffix')}` : e.name }))}
                    aria-label={t('calendar.project.employee')}
                  />
                  <Button
                    size="sm"
                    variant="ghost"
                    icon={Trash2}
                    className="shrink-0 text-red-600"
                    onClick={() => {
                      scheduleService.removeAssignment(a.id);
                      toast.success(t('calendar.toast.assignmentRemoved'));
                    }}
                    aria-label={t('common.delete')}
                  />
                </div>
                <div className="mt-3 grid grid-cols-2 gap-3">
                  <Input type="date" className="min-w-0" value={a.startDate} onChange={(e) => e.target.value && update(a, { startDate: e.target.value })} aria-label={t('calendar.project.startDate')} />
                  <Input type="date" className="min-w-0" value={a.endDate} onChange={(e) => e.target.value && update(a, { endDate: e.target.value })} aria-label={t('calendar.project.endDate')} />
                </div>
                {conflict && (
                  <p className="mt-2 flex items-center gap-1.5 text-xs font-medium text-red-600">
                    <AlertTriangle className="size-3.5" /> {t('calendar.conflict')}
                  </p>
                )}
                {rowError[a.id] && (
                  <p role="alert" className="mt-2 flex items-center gap-1.5 text-xs font-medium text-red-600">
                    <Lock className="size-3.5" /> {rowError[a.id]}
                  </p>
                )}
                <p className="mt-2 text-xs text-slate-500">
                  {t('calendar.businessDays', { count: businessDaysBetween(a.startDate, a.endDate) })} · {formatDate(a.startDate)} – {formatDate(a.endDate)}
                </p>
              </li>
            );
          })}
        </ul>
      )}

      <div className="space-y-3 rounded-lg border border-dashed border-slate-300 p-3 dark:border-slate-700">
        <p className="flex items-center gap-2 text-sm font-semibold">
          <UserPlus className="size-4 text-slate-400" /> {t('calendar.project.addAssignment')}
        </p>
        <Select value={add.employeeId} onChange={(v) => setAdd({ ...add, employeeId: v })} options={[{ value: '', label: t('calendar.project.selectEmployee') }, ...active.map((e) => ({ value: e.id, label: e.name }))]} aria-label={t('calendar.project.employee')} />
        <div className="grid grid-cols-2 gap-3">
          <Input type="date" className="min-w-0" value={add.startDate} onChange={(e) => setAdd({ ...add, startDate: e.target.value })} aria-label={t('calendar.project.startDate')} />
          <Input type="date" className="min-w-0" value={add.endDate} onChange={(e) => setAdd({ ...add, endDate: e.target.value })} aria-label={t('calendar.project.endDate')} />
        </div>
        <div className="flex justify-end">
          <Button variant="primary" icon={Plus} onClick={addAssignment} className="w-full sm:w-auto">
            {t('calendar.project.addAssignment')}
          </Button>
        </div>
        {error && (
          <p role="alert" className="flex items-center gap-1.5 text-sm text-red-600">
            <Lock className="size-4" /> {error}
          </p>
        )}
      </div>
    </div>
  );
}
