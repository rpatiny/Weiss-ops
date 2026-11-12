import { useDraggable } from '@dnd-kit/core';
import { AlertTriangle, CheckCircle2, Cog, FileText, MapPin } from 'lucide-react';
import { isLocked } from '@/domain/calendar';
import { enumLabel } from '@/domain/labels';
import { navigate } from '@/app/router';
import { useI18n } from '@/i18n';
import { cn } from '@/lib/cn';
import type { CalendarActivity } from '@/types/models';
import { SERVICE_ICONS, useCalendarCtx, withAlpha } from './CalendarContext';

export type CardVariant = 'full' | 'compact' | 'chip';

interface Props {
  activity: CalendarActivity;
  variant: CardVariant;
  /** Renderização dentro do DragOverlay (sem listeners). */
  overlay?: boolean;
}

/** Cartão de atividade arrastável, usado em todas as visões. */
export function ActivityCard({ activity: a, variant, overlay }: Props) {
  const { t } = useI18n();
  const { employeesById, activitiesById, poById, spindleById, conflicts, onOpenActivity } = useCalendarCtx();
  const locked = isLocked(a);
  const { attributes, listeners, setNodeRef, isDragging } = useDraggable({
    id: a.id,
    data: { activityId: a.id },
    disabled: locked || overlay,
  });

  const emp = employeesById.get(a.employeeId);
  const color = emp?.color ?? '#64748b';
  const conflictIds = conflicts.get(a.id);
  const hasConflict = !!conflictIds?.length;
  const Icon = SERVICE_ICONS[a.serviceType];
  const po = a.poId ? poById.get(a.poId) : undefined;
  const sp = a.spindleId ? spindleById.get(a.spindleId) : undefined;
  const canceled = a.status === 'canceled';
  const completed = a.status === 'completed';

  const conflictTitle = hasConflict
    ? `${t('calendar.conflict')} — ${t('calendar.conflictWith', {
        list: conflictIds
          .map((id) => activitiesById.get(id))
          .filter((x): x is CalendarActivity => !!x)
          .map((o) => `${o.startTime}–${o.endTime} ${o.customer}`)
          .join(', '),
      })}`
    : undefined;

  const common = {
    ref: overlay ? undefined : setNodeRef,
    'data-activity-id': a.id,
    ...(overlay ? {} : attributes),
    ...(overlay ? {} : listeners),
    onClick: () => !overlay && onOpenActivity(a),
    title: [conflictTitle, `${a.startTime}–${a.endTime} · ${a.customer}`, a.description].filter(Boolean).join('\n'),
    style: { borderLeftColor: color, backgroundColor: withAlpha(color, canceled ? 0.04 : 0.09) },
    className: cn(
      'group relative w-full cursor-pointer rounded-md border border-l-4 border-slate-200 text-left transition-shadow select-none dark:border-slate-700/80',
      'hover:shadow-md focus-visible:ring-2 focus-visible:ring-brand-500 focus-visible:outline-none',
      !locked && !overlay && 'cursor-grab active:cursor-grabbing',
      isDragging && 'opacity-30',
      overlay && 'rotate-1 shadow-2xl ring-2 ring-brand-500',
      hasConflict && 'ring-2 ring-red-500 ring-offset-1 dark:ring-offset-slate-900',
      canceled && 'opacity-60',
    ),
  };

  const stopBadge = (
    <span
      className="inline-flex size-4 shrink-0 items-center justify-center rounded-full text-[9px] font-bold text-white"
      style={{ backgroundColor: color }}
      title={t('calendar.stop', { n: a.routeOrder })}
    >
      {a.routeOrder}
    </span>
  );

  if (variant === 'chip') {
    return (
      <div {...common} className={cn(common.className, 'flex items-center gap-1 px-1.5 py-0.5 text-[11px]')}>
        {hasConflict && <AlertTriangle className="size-3 shrink-0 text-red-600" />}
        <span className="font-mono text-slate-500 dark:text-slate-400">{a.startTime}</span>
        <span className={cn('truncate font-medium', canceled && 'line-through')}>{a.customer}</span>
      </div>
    );
  }

  if (variant === 'compact') {
    return (
      <div {...common} className={cn(common.className, 'px-1.5 py-1 text-xs')}>
        <div className="flex items-center gap-1">
          {stopBadge}
          <span className="font-mono text-[10px] text-slate-500 dark:text-slate-400">
            {a.startTime}–{a.endTime}
          </span>
          {hasConflict && <AlertTriangle className="ml-auto size-3.5 shrink-0 text-red-600" />}
          {completed && !hasConflict && <CheckCircle2 className="ml-auto size-3.5 shrink-0 text-green-600" />}
        </div>
        <p className={cn('mt-0.5 flex items-center gap-1 truncate font-medium text-slate-800 dark:text-slate-100', canceled && 'line-through')}>
          <Icon className="size-3 shrink-0 text-slate-500" />
          <span className="truncate">{a.customer}</span>
        </p>
      </div>
    );
  }

  // full
  return (
    <div {...common} className={cn(common.className, 'p-2 text-xs')}>
      <div className="flex items-center gap-1.5">
        {stopBadge}
        <span className="font-mono text-[11px] font-medium text-slate-600 dark:text-slate-300">
          {a.startTime}–{a.endTime}
        </span>
        {hasConflict && (
          <span className="ml-auto inline-flex items-center gap-0.5 rounded bg-red-600 px-1 py-px text-[10px] font-semibold text-white">
            <AlertTriangle className="size-3" />
          </span>
        )}
        {completed && !hasConflict && <CheckCircle2 className="ml-auto size-3.5 text-green-600" />}
      </div>
      <p className={cn('mt-1 line-clamp-2 text-[13px] leading-tight font-semibold text-slate-900 dark:text-white', canceled && 'line-through')}>{a.customer}</p>
      <p className="mt-0.5 flex items-center gap-1 text-slate-600 dark:text-slate-300">
        <Icon className="size-3 shrink-0" />
        <span className="truncate">{enumLabel(t, 'serviceType', a.serviceType)}</span>
      </p>
      {a.description && <p className="mt-0.5 line-clamp-2 text-slate-500 dark:text-slate-400">{a.description}</p>}
      {a.address && (
        <p className="mt-1 flex items-start gap-1 text-[11px] text-slate-500 dark:text-slate-400">
          <MapPin className="mt-px size-3 shrink-0" />
          <span className="line-clamp-1">{a.address}</span>
        </p>
      )}
      <div className="mt-1.5 flex flex-wrap items-center gap-1">
        {emp && (
          <span className="inline-flex items-center gap-1 rounded bg-white/70 px-1 py-px text-[10px] font-medium text-slate-700 dark:bg-slate-900/60 dark:text-slate-300">
            <span className="size-1.5 rounded-full" style={{ backgroundColor: color }} />
            {emp.name.split(' ')[0]}
          </span>
        )}
        {po && (
          <LinkChip icon={FileText} label={po.poNumber} title={t('calendar.openPO', { number: po.poNumber })} onClick={() => navigate('/purchase-orders', { open: po.id })} disabled={overlay} />
        )}
        {sp && (
          <LinkChip icon={Cog} label={sp.serialNumber} title={t('calendar.openSpindle', { serial: sp.serialNumber })} onClick={() => navigate('/financial', { open: sp.id })} disabled={overlay} />
        )}
        {a.status !== 'planned' && !completed && (
          <span className="rounded bg-white/70 px-1 py-px text-[10px] text-slate-600 dark:bg-slate-900/60 dark:text-slate-300">{enumLabel(t, 'activityStatus', a.status)}</span>
        )}
      </div>
    </div>
  );
}

function LinkChip({ icon: Icon, label, title, onClick, disabled }: { icon: typeof Cog; label: string; title: string; onClick: () => void; disabled?: boolean }) {
  return (
    <button
      type="button"
      title={title}
      disabled={disabled}
      onPointerDown={(e) => e.stopPropagation()}
      onClick={(e) => {
        e.stopPropagation();
        onClick();
      }}
      className="inline-flex items-center gap-0.5 rounded bg-slate-900/80 px-1 py-px font-mono text-[10px] text-white hover:bg-brand-600 dark:bg-slate-700"
    >
      <Icon className="size-2.5" />
      {label}
    </button>
  );
}
