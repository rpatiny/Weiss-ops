import { useMemo, useState } from 'react';
import {
  CalendarCheck2,
  Mail,
  Pencil,
  Phone,
  Plus,
  Power,
  Search,
  Trash2,
  UserCheck,
  UserX,
  Users,
} from 'lucide-react';
import { StatusBadge } from '@/components/ui/Badge';
import { Button } from '@/components/ui/Button';
import { Select } from '@/components/ui/Field';
import { ConfirmDialog } from '@/components/ui/Modal';
import { Avatar, EmptyState, PageHeader, StatCard } from '@/components/ui/misc';
import { useToast } from '@/components/ui/Toast';
import { useCollection } from '@/data/hooks';
import { employeeService, upcomingOpenActivities } from '@/domain/employees';
import { EMPLOYEE_STATUS } from '@/domain/labels';
import { addDays, todayISO } from '@/lib/dates';
import { cn } from '@/lib/cn';
import type { Employee } from '@/types/models';
import { EmployeeFormDrawer } from './EmployeeFormDrawer';

type StatusFilter = 'all' | Employee['status'];

export function EmployeesPage() {
  const employees = useCollection('employees');
  const activities = useCollection('activities');
  const toast = useToast();

  const [query, setQuery] = useState('');
  const [statusFilter, setStatusFilter] = useState<StatusFilter>('all');
  const [editing, setEditing] = useState<Employee | undefined>();
  const [drawerOpen, setDrawerOpen] = useState(false);
  const [deleting, setDeleting] = useState<Employee | undefined>();

  const today = todayISO();
  const in7 = addDays(today, 7);

  const stats = useMemo(() => {
    const active = employees.filter((e) => e.status === 'active').length;
    const week = activities.filter((a) => a.date >= today && a.date <= in7 && a.status !== 'canceled').length;
    return { total: employees.length, active, inactive: employees.length - active, week };
  }, [employees, activities, today, in7]);

  /** Contagem de atividades por colaborador (histórico total + futuras abertas). */
  const counts = useMemo(() => {
    const map = new Map<string, { total: number; upcoming: number }>();
    for (const e of employees) {
      map.set(e.id, {
        total: activities.filter((a) => a.employeeId === e.id).length,
        upcoming: upcomingOpenActivities(e.id, activities, today).length,
      });
    }
    return map;
  }, [employees, activities, today]);

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    return employees
      .filter((e) => statusFilter === 'all' || e.status === statusFilter)
      .filter((e) => !q || [e.name, e.role, e.email, e.phone].some((f) => f.toLowerCase().includes(q)))
      .sort((a, b) => (a.status === b.status ? a.name.localeCompare(b.name) : a.status === 'active' ? -1 : 1));
  }, [employees, query, statusFilter]);

  const openCreate = () => {
    setEditing(undefined);
    setDrawerOpen(true);
  };
  const openEdit = (e: Employee) => {
    setEditing(e);
    setDrawerOpen(true);
  };

  const toggleStatus = (e: Employee) => {
    const next = e.status === 'active' ? 'inactive' : 'active';
    employeeService.setStatus(e.id, next);
    toast.success(`${e.name} ${next === 'active' ? 'reativado(a)' : 'inativado(a)'}.`);
    const upcoming = counts.get(e.id)?.upcoming ?? 0;
    if (next === 'inactive' && upcoming) toast.info(`${upcoming} atividade(s) futura(s) continuam atribuídas — reatribua na Agenda.`);
  };

  const deleteInfo = deleting ? employeeService.canDelete(deleting.id) : undefined;

  const confirmDelete = () => {
    if (!deleting || !deleteInfo) return;
    if (deleteInfo.ok) {
      employeeService.remove(deleting.id);
      toast.success(`${deleting.name} excluído(a).`);
    } else {
      employeeService.setStatus(deleting.id, 'inactive');
      toast.success(`${deleting.name} inativado(a) — histórico preservado.`);
    }
    setDeleting(undefined);
  };

  return (
    <>
      <PageHeader
        icon={Users}
        title="Colaboradores"
        description="Equipe técnica, de bancada e logística disponível para a agenda de serviços."
        actions={
          <Button variant="primary" icon={Plus} onClick={openCreate}>
            Novo colaborador
          </Button>
        }
      />

      <div className="mb-6 grid grid-cols-2 gap-3 lg:grid-cols-4">
        <StatCard label="Total" value={stats.total} icon={Users} onClick={() => setStatusFilter('all')} />
        <StatCard label="Ativos" value={stats.active} icon={UserCheck} tone="success" onClick={() => setStatusFilter('active')} />
        <StatCard label="Inativos" value={stats.inactive} icon={UserX} onClick={() => setStatusFilter('inactive')} />
        <StatCard label="Atividades (7 dias)" value={stats.week} icon={CalendarCheck2} tone="info" hint="Agendadas para a próxima semana" />
      </div>

      <div className="card overflow-hidden">
        <div className="flex flex-col gap-3 border-b border-slate-200 p-4 sm:flex-row sm:items-center dark:border-slate-800">
          <div className="relative flex-1">
            <Search className="pointer-events-none absolute top-1/2 left-3 size-4 -translate-y-1/2 text-slate-400" />
            <input
              className="input pl-9"
              placeholder="Buscar por nome, cargo, e-mail ou telefone…"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              aria-label="Buscar colaboradores"
            />
          </div>
          <Select<StatusFilter>
            className="sm:w-44"
            value={statusFilter}
            onChange={setStatusFilter}
            aria-label="Filtrar por status"
            options={[
              { value: 'all', label: 'Todos os status' },
              { value: 'active', label: 'Somente ativos' },
              { value: 'inactive', label: 'Somente inativos' },
            ]}
          />
        </div>

        {filtered.length === 0 ? (
          <EmptyState
            icon={Users}
            title={employees.length ? 'Nenhum colaborador encontrado' : 'Nenhum colaborador cadastrado'}
            description={employees.length ? 'Ajuste a busca ou o filtro de status.' : 'Cadastre a equipe para começar a montar a agenda de rotas.'}
            action={!employees.length && <Button variant="primary" icon={Plus} onClick={openCreate}>Cadastrar colaborador</Button>}
          />
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full">
              <thead className="bg-slate-50 dark:bg-slate-800/50">
                <tr>
                  <th className="th">Colaborador</th>
                  <th className="th hidden md:table-cell">Contato</th>
                  <th className="th hidden sm:table-cell">Status</th>
                  <th className="th hidden text-center sm:table-cell">Atividades</th>
                  <th className="th text-right"><span className="sr-only sm:not-sr-only">Ações</span></th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100 dark:divide-slate-800">
                {filtered.map((e) => {
                  const c = counts.get(e.id) ?? { total: 0, upcoming: 0 };
                  const inactive = e.status === 'inactive';
                  return (
                    <tr key={e.id} className={cn('group transition-colors hover:bg-slate-50 dark:hover:bg-slate-800/40', inactive && 'bg-slate-50/50 dark:bg-slate-900/40')}>
                      <td className="td">
                        <button onClick={() => openEdit(e)} className="flex items-center gap-3 text-left">
                          <Avatar name={e.name} color={e.color} muted={inactive} />
                          <div className="min-w-0">
                            <p className={cn('font-medium text-slate-900 group-hover:text-brand-700 dark:text-white dark:group-hover:text-brand-400', inactive && 'text-slate-500 dark:text-slate-400')}>
                              {e.name}
                            </p>
                            <p className="text-xs text-slate-500">{e.role}</p>
                            <span className="mt-1 inline-block sm:hidden">
                              <StatusBadge map={EMPLOYEE_STATUS} value={e.status} />
                            </span>
                          </div>
                        </button>
                      </td>
                      <td className="td hidden md:table-cell">
                        <div className="space-y-0.5 text-xs">
                          {e.phone && (
                            <a href={`tel:${e.phone.replace(/\D/g, '')}`} className="flex items-center gap-1.5 text-slate-600 hover:text-brand-700 dark:text-slate-400">
                              <Phone className="size-3.5" /> {e.phone}
                            </a>
                          )}
                          {e.email && (
                            <a href={`mailto:${e.email}`} className="flex items-center gap-1.5 text-slate-600 hover:text-brand-700 dark:text-slate-400">
                              <Mail className="size-3.5" /> {e.email}
                            </a>
                          )}
                        </div>
                      </td>
                      <td className="td hidden sm:table-cell">
                        <StatusBadge map={EMPLOYEE_STATUS} value={e.status} />
                      </td>
                      <td className="td hidden text-center sm:table-cell">
                        <span className="font-semibold tabular-nums">{c.upcoming}</span>
                        <span className="text-xs text-slate-500"> futuras · {c.total} no histórico</span>
                      </td>
                      <td className="td">
                        <div className="flex justify-end gap-1">
                          <Button size="sm" variant="ghost" icon={Pencil} onClick={() => openEdit(e)} title="Editar" aria-label={`Editar ${e.name}`} />
                          <Button
                            size="sm"
                            variant="ghost"
                            icon={Power}
                            onClick={() => toggleStatus(e)}
                            title={inactive ? 'Reativar' : 'Inativar'}
                            aria-label={`${inactive ? 'Reativar' : 'Inativar'} ${e.name}`}
                            className={inactive ? 'text-green-600' : 'text-amber-600'}
                          />
                          <Button size="sm" variant="ghost" icon={Trash2} onClick={() => setDeleting(e)} title="Excluir" aria-label={`Excluir ${e.name}`} className="text-red-600" />
                        </div>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>

      <EmployeeFormDrawer open={drawerOpen} employee={editing} onClose={() => setDrawerOpen(false)} />

      <ConfirmDialog
        open={!!deleting}
        title={deleteInfo?.ok ? 'Excluir colaborador?' : 'Colaborador possui histórico'}
        confirmLabel={deleteInfo?.ok ? 'Excluir' : 'Inativar colaborador'}
        danger={!!deleteInfo?.ok}
        message={
          deleteInfo?.ok ? (
            <>
              <strong>{deleting?.name}</strong> será removido(a) permanentemente. Esta ação não pode ser desfeita.
            </>
          ) : (
            <>
              <strong>{deleting?.name}</strong> possui <strong>{deleteInfo?.activityCount}</strong> atividade(s) na agenda. Para preservar o histórico, o colaborador não pode ser excluído — ele será <strong>inativado</strong> e deixará de aparecer em novos agendamentos.
            </>
          )
        }
        onConfirm={confirmDelete}
        onCancel={() => setDeleting(undefined)}
      />
    </>
  );
}
