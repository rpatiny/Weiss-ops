import { useMemo, useState } from 'react';
import { CalendarCheck2, Mail, Pencil, Phone, Plus, Power, Search, Trash2, UserCheck, UserX, Users } from 'lucide-react';
import { StatusBadge } from '@/components/ui/Badge';
import { Button } from '@/components/ui/Button';
import { Select } from '@/components/ui/Field';
import { ConfirmDialog } from '@/components/ui/Modal';
import { Avatar, EmptyState, PageHeader, StatCard } from '@/components/ui/misc';
import { useToast } from '@/components/ui/Toast';
import { useCollection } from '@/data/hooks';
import { employeeService, upcomingAssignments } from '@/domain/employees';
import { rangesOverlap } from '@/lib/dates';
import { useI18n } from '@/i18n';
import { addDays, todayISO } from '@/lib/dates';
import { cn } from '@/lib/cn';
import type { Employee } from '@/types/models';
import { EmployeeFormDrawer } from './EmployeeFormDrawer';

type StatusFilter = 'all' | Employee['status'];

export function EmployeesPage() {
  const employees = useCollection('employees');
  const assignments = useCollection('assignments');
  const toast = useToast();
  const { t } = useI18n();

  const [query, setQuery] = useState('');
  const [statusFilter, setStatusFilter] = useState<StatusFilter>('all');
  const [editing, setEditing] = useState<Employee | undefined>();
  const [drawerOpen, setDrawerOpen] = useState(false);
  const [deleting, setDeleting] = useState<Employee | undefined>();

  const today = todayISO();
  const in7 = addDays(today, 7);

  const stats = useMemo(() => {
    const active = employees.filter((e) => e.status === 'active').length;
    const week = assignments.filter((a) => rangesOverlap(a.startDate, a.endDate, today, in7)).length;
    return { total: employees.length, active, inactive: employees.length - active, week };
  }, [employees, assignments, today, in7]);

  /** Contagem de atividades por colaborador (histórico total + futuras abertas). */
  const counts = useMemo(() => {
    const map = new Map<string, { total: number; upcoming: number }>();
    for (const e of employees) {
      map.set(e.id, {
        total: assignments.filter((a) => a.employeeId === e.id).length,
        upcoming: upcomingAssignments(e.id, assignments, today).length,
      });
    }
    return map;
  }, [employees, assignments, today]);

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
    toast.success(t(next === 'active' ? 'employees.toast.reactivated' : 'employees.toast.deactivated', { name: e.name }));
    const upcoming = counts.get(e.id)?.upcoming ?? 0;
    if (next === 'inactive' && upcoming) toast.info(t('employees.toast.upcomingWarning', { count: upcoming }));
  };

  const deleteInfo = deleting ? employeeService.canDelete(deleting.id) : undefined;

  const confirmDelete = () => {
    if (!deleting || !deleteInfo) return;
    if (deleteInfo.ok) {
      employeeService.remove(deleting.id);
      toast.success(t('employees.toast.deleted', { name: deleting.name }));
    } else {
      employeeService.setStatus(deleting.id, 'inactive');
      toast.success(t('employees.toast.deactivatedKeepHistory', { name: deleting.name }));
    }
    setDeleting(undefined);
  };

  return (
    <>
      <PageHeader
        icon={Users}
        title={t('employees.title')}
        description={t('employees.description')}
        actions={
          <Button variant="primary" icon={Plus} onClick={openCreate}>
            {t('employees.new')}
          </Button>
        }
      />

      <div className="mb-6 grid grid-cols-2 gap-3 lg:grid-cols-4">
        <StatCard label={t('employees.stats.total')} value={stats.total} icon={Users} onClick={() => setStatusFilter('all')} />
        <StatCard label={t('employees.stats.active')} value={stats.active} icon={UserCheck} tone="success" onClick={() => setStatusFilter('active')} />
        <StatCard label={t('employees.stats.inactive')} value={stats.inactive} icon={UserX} onClick={() => setStatusFilter('inactive')} />
        <StatCard label={t('employees.stats.next7')} value={stats.week} icon={CalendarCheck2} tone="info" hint={t('employees.stats.next7Hint')} />
      </div>

      <div className="card overflow-hidden">
        <div className="flex flex-col gap-3 border-b border-slate-200 p-4 sm:flex-row sm:items-center dark:border-slate-800">
          <div className="relative flex-1">
            <Search className="pointer-events-none absolute top-1/2 left-3 size-4 -translate-y-1/2 text-slate-400" />
            <input className="input pl-9" placeholder={t('employees.searchPlaceholder')} value={query} onChange={(e) => setQuery(e.target.value)} aria-label={t('common.search')} />
          </div>
          <Select<StatusFilter>
            className="sm:w-44"
            value={statusFilter}
            onChange={setStatusFilter}
            aria-label={t('common.status')}
            options={[
              { value: 'all', label: t('employees.filterAll') },
              { value: 'active', label: t('employees.filterActive') },
              { value: 'inactive', label: t('employees.filterInactive') },
            ]}
          />
        </div>

        {filtered.length === 0 ? (
          <EmptyState
            icon={Users}
            title={employees.length ? t('employees.empty.noneFound') : t('employees.empty.noneRegistered')}
            description={employees.length ? t('employees.empty.noneFoundHint') : t('employees.empty.noneRegisteredHint')}
            action={
              !employees.length && (
                <Button variant="primary" icon={Plus} onClick={openCreate}>
                  {t('employees.empty.cta')}
                </Button>
              )
            }
          />
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full">
              <thead className="bg-slate-50 dark:bg-slate-800/50">
                <tr>
                  <th className="th">{t('employees.columns.employee')}</th>
                  <th className="th hidden md:table-cell">{t('employees.columns.contact')}</th>
                  <th className="th hidden sm:table-cell">{t('common.status')}</th>
                  <th className="th hidden text-center sm:table-cell">{t('employees.columns.activities')}</th>
                  <th className="th text-right">
                    <span className="sr-only sm:not-sr-only">{t('common.actions')}</span>
                  </th>
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
                              <StatusBadge kind="employeeStatus" value={e.status} />
                            </span>
                          </div>
                        </button>
                      </td>
                      <td className="td hidden md:table-cell">
                        <div className="space-y-0.5 text-xs">
                          {e.phone && (
                            <a href={`tel:${e.phone.replace(/[^\d+]/g, '')}`} className="flex items-center gap-1.5 text-slate-600 hover:text-brand-700 dark:text-slate-400">
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
                        <StatusBadge kind="employeeStatus" value={e.status} />
                      </td>
                      <td className="td hidden text-center sm:table-cell">
                        <span className="font-semibold tabular-nums">{c.upcoming}</span>
                        <span className="text-xs text-slate-500">
                          {' '}
                          {t('employees.upcomingShort')} · {t('employees.historyShort', { total: c.total })}
                        </span>
                      </td>
                      <td className="td">
                        <div className="flex justify-end gap-1">
                          <Button size="sm" variant="ghost" icon={Pencil} onClick={() => openEdit(e)} title={t('common.edit')} aria-label={`${t('common.edit')} ${e.name}`} />
                          <Button
                            size="sm"
                            variant="ghost"
                            icon={Power}
                            onClick={() => toggleStatus(e)}
                            title={inactive ? t('employees.actions.reactivate') : t('employees.actions.deactivate')}
                            aria-label={`${inactive ? t('employees.actions.reactivate') : t('employees.actions.deactivate')} ${e.name}`}
                            className={inactive ? 'text-green-600' : 'text-amber-600'}
                          />
                          <Button size="sm" variant="ghost" icon={Trash2} onClick={() => setDeleting(e)} title={t('common.delete')} aria-label={`${t('common.delete')} ${e.name}`} className="text-red-600" />
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
        title={deleteInfo?.ok ? t('employees.deleteDialog.deleteTitle') : t('employees.deleteDialog.historyTitle')}
        confirmLabel={deleteInfo?.ok ? t('employees.deleteDialog.deleteConfirm') : t('employees.deleteDialog.deactivateConfirm')}
        danger={!!deleteInfo?.ok}
        message={
          deleteInfo?.ok
            ? t('employees.deleteDialog.deleteMessage', { name: deleting?.name ?? '' })
            : t('employees.deleteDialog.historyMessage', { name: deleting?.name ?? '', count: deleteInfo?.activityCount ?? 0 })
        }
        onConfirm={confirmDelete}
        onCancel={() => setDeleting(undefined)}
      />
    </>
  );
}
