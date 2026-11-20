import { forecastLevel, formatMinutes, type ForecastLevel } from '@/domain/timeTracking';
import { useI18n } from '@/i18n';
import { cn } from '@/lib/cn';

const BAR: Record<ForecastLevel, string> = {
  none: 'bg-slate-300 dark:bg-slate-600',
  ok: 'bg-green-500',
  near: 'bg-amber-400',
  limit: 'bg-orange-500',
  over: 'bg-red-600',
};
const TEXT: Record<ForecastLevel, string> = {
  none: 'text-slate-700 dark:text-slate-200',
  ok: 'text-green-700 dark:text-green-400',
  near: 'text-amber-700 dark:text-amber-400',
  limit: 'text-orange-700 dark:text-orange-400',
  over: 'text-red-700 dark:text-red-400',
};

/**
 * Horas reais × previstas: "3h20 / 4h" com barra que muda de cor (verde → âmbar → laranja → vermelho quando passa).
 * Sem previsão, mostra só as horas.
 */
export function ForecastMeter({ minutes, hours, compact, className }: { minutes: number; hours?: number; compact?: boolean; className?: string }) {
  const { t } = useI18n();
  const level = forecastLevel(minutes, hours);
  if (level === 'none') return <span className={cn('font-semibold tabular-nums', className)}>{minutes ? formatMinutes(minutes) : '—'}</span>;
  const pct = Math.round((minutes / (hours! * 60)) * 100);
  const over = minutes - hours! * 60;
  const title = `${t(`timesheet.forecast.level.${level}`)} · ${pct}%`;
  return (
    <span className={cn('inline-flex flex-col items-end gap-0.5', className)} title={title}>
      <span className={cn('text-sm font-semibold tabular-nums', TEXT[level])}>
        {formatMinutes(minutes)} <span className="font-normal text-slate-500">/ {formatMinutes(hours! * 60)}</span>
      </span>
      <span className={cn('relative h-1.5 overflow-hidden rounded-full bg-slate-200 dark:bg-slate-700', compact ? 'w-16' : 'w-24')} aria-hidden>
        <span className={cn('absolute inset-y-0 left-0 rounded-full', BAR[level])} style={{ width: `${Math.min(100, pct)}%` }} />
      </span>
      {level === 'over' ? (
        <span className="text-[11px] font-semibold text-red-700 tabular-nums dark:text-red-400">{t('timesheet.forecast.over', { time: formatMinutes(over) })}</span>
      ) : (
        !compact && <span className="text-[11px] text-slate-500 tabular-nums">{t('timesheet.forecast.left', { time: formatMinutes(-over) })}</span>
      )}
    </span>
  );
}
