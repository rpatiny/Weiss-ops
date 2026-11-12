import type { ReactNode } from 'react';
import type { LucideIcon } from 'lucide-react';
import { cn } from '@/lib/cn';
import { initials } from '@/lib/format';

export function PageHeader({ title, description, actions, icon: Icon }: { title: string; description?: string; actions?: ReactNode; icon?: LucideIcon }) {
  return (
    <div className="mb-6 flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
      <div className="flex items-center gap-3">
        {Icon && (
          <div className="flex size-10 items-center justify-center rounded-lg bg-slate-900 text-brand-400 dark:bg-slate-800">
            <Icon className="size-5" />
          </div>
        )}
        <div>
          <h1 className="text-xl font-bold tracking-tight text-slate-900 sm:text-2xl dark:text-white">{title}</h1>
          {description && <p className="mt-0.5 text-sm text-slate-500 dark:text-slate-400">{description}</p>}
        </div>
      </div>
      {actions && <div className="flex flex-wrap items-center gap-2">{actions}</div>}
    </div>
  );
}

export function EmptyState({ icon: Icon, title, description, action }: { icon: LucideIcon; title: string; description?: string; action?: ReactNode }) {
  return (
    <div className="flex flex-col items-center justify-center px-6 py-14 text-center">
      <div className="mb-3 flex size-12 items-center justify-center rounded-full bg-slate-100 dark:bg-slate-800">
        <Icon className="size-6 text-slate-400" />
      </div>
      <h3 className="font-semibold text-slate-900 dark:text-white">{title}</h3>
      {description && <p className="mt-1 max-w-sm text-sm text-slate-500">{description}</p>}
      {action && <div className="mt-4">{action}</div>}
    </div>
  );
}

type StatTone = 'default' | 'warning' | 'danger' | 'success' | 'info';
const statTones: Record<StatTone, string> = {
  default: 'bg-slate-100 text-slate-600 dark:bg-slate-800 dark:text-slate-300',
  info: 'bg-blue-100 text-blue-600 dark:bg-blue-500/15 dark:text-blue-300',
  success: 'bg-green-100 text-green-600 dark:bg-green-500/15 dark:text-green-300',
  warning: 'bg-amber-100 text-amber-600 dark:bg-amber-500/15 dark:text-amber-300',
  danger: 'bg-red-100 text-red-600 dark:bg-red-500/15 dark:text-red-300',
};

export function StatCard({ label, value, hint, icon: Icon, tone = 'default', onClick }: { label: string; value: ReactNode; hint?: ReactNode; icon: LucideIcon; tone?: StatTone; onClick?: () => void }) {
  const Comp = onClick ? 'button' : 'div';
  return (
    <Comp onClick={onClick} className={cn('card flex items-start gap-4 p-4 text-left', onClick && 'transition hover:border-brand-500/60 hover:shadow-md')}>
      <div className={cn('flex size-10 shrink-0 items-center justify-center rounded-lg', statTones[tone])}>
        <Icon className="size-5" />
      </div>
      <div className="min-w-0">
        <p className="text-xs font-medium tracking-wide text-slate-500 uppercase dark:text-slate-400">{label}</p>
        <p className="mt-1 text-2xl font-bold text-slate-900 tabular-nums dark:text-white">{value}</p>
        {hint && <p className="mt-0.5 text-xs text-slate-500">{hint}</p>}
      </div>
    </Comp>
  );
}

export function Avatar({ name, color, size = 'md', muted }: { name: string; color: string; size?: 'sm' | 'md' | 'lg'; muted?: boolean }) {
  const s = { sm: 'size-6 text-[10px]', md: 'size-9 text-xs', lg: 'size-12 text-base' }[size];
  return (
    <span
      className={cn('inline-flex shrink-0 items-center justify-center rounded-full font-semibold text-white ring-2 ring-white dark:ring-slate-900', s, muted && 'opacity-50 grayscale')}
      style={{ backgroundColor: color }}
      aria-hidden
    >
      {initials(name)}
    </span>
  );
}
