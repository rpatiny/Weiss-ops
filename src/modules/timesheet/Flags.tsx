import { CheckCircle2, Hourglass, Moon } from 'lucide-react';
import type { JobFlag, WorkerFlag } from '@/domain/timeTracking';
import { useI18n } from '@/i18n';
import { cn } from '@/lib/cn';

/** Etiqueta de status (técnico ou serviço): em andamento · aguardando próxima fase · pronto · sem serviço. */
export function FlowFlag({ flag, next, className }: { flag: WorkerFlag | JobFlag; next?: string; className?: string }) {
  const { t } = useI18n();
  const base = 'inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 text-xs font-bold whitespace-nowrap';
  if (flag === 'working')
    return (
      <span className={cn(base, 'bg-blue-600 text-white', className)}>
        <span className="relative flex size-2">
          <span className="absolute inline-flex size-full animate-ping rounded-full bg-white opacity-70" />
          <span className="relative inline-flex size-2 rounded-full bg-white" />
        </span>
        {t('timesheet.flow.working')}
      </span>
    );
  if (flag === 'waiting')
    return (
      <span className={cn(base, 'bg-amber-400 text-amber-950', className)}>
        <Hourglass className="size-3.5" />
        {next ? t('timesheet.flow.waitingNext', { phase: next }) : t('timesheet.flow.waiting')}
      </span>
    );
  if (flag === 'ready')
    return (
      <span className={cn(base, 'bg-green-600 text-white', className)}>
        <CheckCircle2 className="size-3.5" />
        {t('timesheet.flow.ready')}
      </span>
    );
  return (
    <span className={cn(base, 'bg-slate-200 text-slate-600 dark:bg-slate-800 dark:text-slate-400', className)}>
      <Moon className="size-3.5" />
      {flag === 'not_started' ? t('timesheet.flow.notStarted') : t('timesheet.flow.idle')}
    </span>
  );
}
