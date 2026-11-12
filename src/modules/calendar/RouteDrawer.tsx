import { useEffect, useMemo, useState } from 'react';
import { AlertTriangle, ArrowDown, ArrowUp, Clock, ExternalLink, Home, MapPin, Navigation } from 'lucide-react';
import { StatusBadge } from '@/components/ui/Badge';
import { Button } from '@/components/ui/Button';
import { Drawer } from '@/components/ui/Drawer';
import { Field, Input, Select } from '@/components/ui/Field';
import { Avatar } from '@/components/ui/misc';
import { useToast } from '@/components/ui/Toast';
import { useCollection } from '@/data/hooks';
import { activityService, buildGoogleMapsUrl, dayStops, findConflicts, routableStops } from '@/domain/calendar';
import { enumLabel } from '@/domain/labels';
import { useI18n } from '@/i18n';
import { BASE_ADDRESS } from '@/lib/config';
import { cn } from '@/lib/cn';
import { formatDateLong } from '@/lib/format';
import { usePersistentState } from '@/lib/usePersistentState';
import type { CalendarActivity } from '@/types/models';
import { SERVICE_ICONS } from './CalendarContext';

interface Props {
  open: boolean;
  date: string;
  employeeId?: string;
  onClose: () => void;
  onOpenActivity: (a: CalendarActivity) => void;
}

/** Ordem de paradas diária por colaborador + rota multi-paradas no Google Maps. */
export function RouteDrawer({ open, date: initialDate, employeeId: initialEmp, onClose, onOpenActivity }: Props) {
  const { t } = useI18n();
  const toast = useToast();
  const employees = useCollection('employees');
  const activities = useCollection('activities');
  const [date, setDate] = useState(initialDate);
  const [employeeId, setEmployeeId] = useState(initialEmp ?? '');
  const [fromBase, setFromBase] = usePersistentState('route.fromBase', false);

  /** Colaboradores com paradas na data (primeiro a ser exibido por padrão). */
  const withStops = useMemo(
    () =>
      employees
        .filter((e) => activities.some((a) => a.employeeId === e.id && a.date === date))
        .sort((a, b) => a.name.localeCompare(b.name)),
    [employees, activities, date],
  );

  useEffect(() => {
    if (!open) return;
    setDate(initialDate);
    setEmployeeId(initialEmp ?? '');
  }, [open, initialDate, initialEmp]);

  // Se nenhum colaborador escolhido (ou sem paradas), seleciona o primeiro com paradas.
  useEffect(() => {
    if (!open) return;
    if (!employeeId || !withStops.some((e) => e.id === employeeId)) {
      const first = withStops[0];
      if (first && !initialEmp) setEmployeeId(first.id);
    }
  }, [open, withStops, employeeId, initialEmp]);

  const stops = useMemo(() => dayStops(activities, employeeId, date), [activities, employeeId, date]);
  const routable = routableStops(stops);
  const conflicts = useMemo(() => findConflicts(stops), [stops]);
  const url = routable.length ? buildGoogleMapsUrl(routable.map((s) => s.address), fromBase ? BASE_ADDRESS : undefined) : '';
  const employee = employees.find((e) => e.id === employeeId);

  const move = (index: number, dir: -1 | 1) => {
    const ids = stops.map((s) => s.id);
    const j = index + dir;
    if (j < 0 || j >= ids.length) return;
    [ids[index], ids[j]] = [ids[j]!, ids[index]!];
    activityService.reorder(employeeId, date, ids);
  };

  const sortByTime = () => {
    activityService.sortByTime(employeeId, date);
    toast.success(t('calendar.route.reordered'));
  };

  const empOptions = [
    ...withStops.map((e) => ({ value: e.id, label: `${e.name} (${activities.filter((a) => a.employeeId === e.id && a.date === date).length})` })),
    ...employees
      .filter((e) => e.status === 'active' && !withStops.some((w) => w.id === e.id))
      .sort((a, b) => a.name.localeCompare(b.name))
      .map((e) => ({ value: e.id, label: `${e.name} (0)` })),
  ];

  return (
    <Drawer
      open={open}
      onClose={onClose}
      width="lg"
      title={t('calendar.route.title')}
      subtitle={formatDateLong(date)}
      footer={
        <>
          <Button onClick={onClose}>{t('common.close')}</Button>
          <a
            href={url || undefined}
            target="_blank"
            rel="noopener noreferrer"
            aria-disabled={!url}
            className={cn(
              'inline-flex h-9 items-center gap-2 rounded-lg bg-brand-500 px-3.5 text-sm font-semibold text-slate-950 shadow-sm hover:bg-brand-400',
              !url && 'pointer-events-none opacity-50',
            )}
          >
            <Navigation className="size-4" />
            {t('calendar.route.openMaps')}
            <ExternalLink className="size-3.5" />
          </a>
        </>
      }
    >
      <div className="space-y-5">
        <div className="grid gap-4 sm:grid-cols-2">
          <Field label={t('calendar.route.date')}>
            {(id) => <Input id={id} type="date" value={date} onChange={(e) => e.target.value && setDate(e.target.value)} />}
          </Field>
          <Field label={t('calendar.route.employee')}>
            {(id) => <Select id={id} value={employeeId} onChange={setEmployeeId} options={empOptions.length ? empOptions : [{ value: '', label: '—' }]} />}
          </Field>
        </div>

        {employee && (
          <div className="flex items-center gap-3 rounded-lg bg-slate-50 p-3 dark:bg-slate-800/50">
            <Avatar name={employee.name} color={employee.color} />
            <div className="min-w-0 flex-1">
              <p className="font-medium">{employee.name}</p>
              <p className="text-xs text-slate-500">{t('calendar.route.stopsCount', { count: routable.length })}</p>
            </div>
            <Button size="sm" icon={Clock} onClick={sortByTime} disabled={stops.length < 2}>
              {t('calendar.route.sortByTime')}
            </Button>
          </div>
        )}

        <label className="flex cursor-pointer items-center gap-2 text-sm">
          <input type="checkbox" checked={fromBase} onChange={(e) => setFromBase(e.target.checked)} className="size-4 rounded accent-amber-500" />
          {t('calendar.route.startAtBase')}
        </label>

        {stops.length === 0 ? (
          <p className="rounded-lg border border-dashed border-slate-300 p-6 text-center text-sm text-slate-500 dark:border-slate-700">{t('calendar.route.noStops')}</p>
        ) : (
          <ol className="relative space-y-2">
            {fromBase && <BaseStop label={t('calendar.route.base')} />}
            {stops.map((s, i) => {
              const Icon = SERVICE_ICONS[s.serviceType];
              const excluded = s.status === 'canceled' || !s.address.trim();
              const conflict = conflicts.has(s.id);
              return (
                <li
                  key={s.id}
                  className={cn(
                    'flex items-start gap-3 rounded-lg border p-3',
                    conflict ? 'border-red-400 bg-red-50/60 dark:border-red-800 dark:bg-red-950/30' : 'border-slate-200 dark:border-slate-800',
                    excluded && 'opacity-50',
                  )}
                >
                  <span
                    className="flex size-7 shrink-0 items-center justify-center rounded-full text-sm font-bold text-white"
                    style={{ backgroundColor: employee?.color ?? '#64748b' }}
                  >
                    {s.routeOrder}
                  </span>
                  <button type="button" onClick={() => onOpenActivity(s)} className="min-w-0 flex-1 text-left">
                    <p className="flex flex-wrap items-center gap-2">
                      <span className="font-mono text-xs text-slate-500">
                        {s.startTime}–{s.endTime}
                      </span>
                      <StatusBadge kind="activityStatus" value={s.status} />
                      {conflict && (
                        <span className="inline-flex items-center gap-1 text-xs font-semibold text-red-600">
                          <AlertTriangle className="size-3.5" /> {t('calendar.conflict')}
                        </span>
                      )}
                    </p>
                    <p className={cn('mt-0.5 font-medium hover:text-brand-700', s.status === 'canceled' && 'line-through')}>{s.customer}</p>
                    <p className="flex items-center gap-1 text-xs text-slate-500">
                      <Icon className="size-3.5" /> {enumLabel(t, 'serviceType', s.serviceType)}
                      {s.description && <> · {s.description}</>}
                    </p>
                    <p className="mt-0.5 flex items-start gap-1 text-xs text-slate-500">
                      <MapPin className="mt-0.5 size-3.5 shrink-0" /> {s.address || '—'}
                    </p>
                  </button>
                  <div className="flex flex-col gap-1">
                    <Button size="sm" variant="ghost" icon={ArrowUp} disabled={i === 0} onClick={() => move(i, -1)} aria-label={t('calendar.route.moveUp')} title={t('calendar.route.moveUp')} />
                    <Button size="sm" variant="ghost" icon={ArrowDown} disabled={i === stops.length - 1} onClick={() => move(i, 1)} aria-label={t('calendar.route.moveDown')} title={t('calendar.route.moveDown')} />
                  </div>
                </li>
              );
            })}
            {fromBase && <BaseStop label={t('calendar.route.base')} />}
          </ol>
        )}

        <p className="text-xs text-slate-500">{t('calendar.route.excludedNote')}</p>
        {url && (
          <p className="truncate rounded bg-slate-100 px-2 py-1 font-mono text-[11px] text-slate-500 dark:bg-slate-800" title={url}>
            {url}
          </p>
        )}
      </div>
    </Drawer>
  );
}

function BaseStop({ label }: { label: string }) {
  return (
    <li className="flex items-center gap-3 rounded-lg border border-dashed border-slate-300 p-2.5 text-sm text-slate-500 dark:border-slate-700">
      <span className="flex size-7 items-center justify-center rounded-full bg-slate-200 dark:bg-slate-700">
        <Home className="size-4" />
      </span>
      <span>
        <span className="font-medium text-slate-700 dark:text-slate-300">{label}</span>
        <span className="block text-xs">{BASE_ADDRESS}</span>
      </span>
    </li>
  );
}
