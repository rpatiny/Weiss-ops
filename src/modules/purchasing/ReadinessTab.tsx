import { useMemo, useState } from 'react';
import { AlertTriangle, CheckCircle2, CircleDashed, ClipboardCheck, ExternalLink, Link2, ShoppingCart, Truck } from 'lucide-react';
import { navigate } from '@/app/router';
import { StatusBadge } from '@/components/ui/Badge';
import { Button } from '@/components/ui/Button';
import { EmptyState } from '@/components/ui/misc';
import { isProjectActive, type ReadinessItem } from '@/domain/purchasing';
import { useI18n } from '@/i18n';
import { cn } from '@/lib/cn';
import { diffDays } from '@/lib/dates';
import { formatDate } from '@/lib/format';
import { usePurchasingData } from './usePurchasingData';

/** "Checklist para começar": prontidão de materiais de cada projeto ativo. */
export function ReadinessTab() {
  const { t } = useI18n();
  const pd = usePurchasingData();
  const [onlyNotReady, setOnlyNotReady] = useState(false);

  const list = useMemo(
    () =>
      pd.projects
        .filter(isProjectActive)
        .map((p) => ({ p, r: pd.readinessOf(p) }))
        .sort((a, b) => (a.r.start ?? '9999').localeCompare(b.r.start ?? '9999')),
    [pd],
  );
  const shown = onlyNotReady ? list.filter((x) => x.r.status !== 'ready') : list;

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <p className="text-sm text-slate-500">{t('purchasing.readiness.hint')}</p>
        <label className="flex cursor-pointer items-center gap-2 text-sm">
          <input type="checkbox" className="size-4 accent-amber-500" checked={onlyNotReady} onChange={(e) => setOnlyNotReady(e.target.checked)} />
          {t('purchasing.readiness.onlyNotReady')}
        </label>
      </div>

      {shown.length === 0 ? (
        <div className="card">
          <EmptyState icon={ClipboardCheck} title={t('purchasing.readiness.empty')} />
        </div>
      ) : (
        <div className="grid gap-4 xl:grid-cols-2">
          {shown.map(({ p, r }) => {
            const days = r.start ? diffDays(pd.today, r.start) : undefined;
            return (
              <article key={p.id} className={cn('card overflow-hidden border-l-4')} style={{ borderLeftColor: p.color }}>
                <header className="flex flex-wrap items-start gap-3 border-b border-slate-200 p-4 dark:border-slate-800">
                  <div className="min-w-0 flex-1">
                    <p className="font-mono text-xs text-slate-500">{p.projectNumber}</p>
                    <h3 className="truncate font-semibold text-slate-900 dark:text-white">{p.customer}</h3>
                    <p className="text-xs text-slate-500">
                      {r.start
                        ? `${t('purchasing.readiness.startsOn', { date: formatDate(r.start) })} · ${days! > 0 ? t('purchasing.readiness.startsIn', { days: days! }) : t('purchasing.readiness.started')}`
                        : t('purchasing.readiness.noStart')}
                    </p>
                  </div>
                  <div className="flex flex-col items-end gap-2">
                    <StatusBadge kind="readiness" value={r.status} />
                    <Button size="sm" variant="ghost" icon={ExternalLink} onClick={() => navigate('/calendar', { open: p.id })}>
                      {t('purchasing.readiness.openProject')}
                    </Button>
                  </div>
                  {r.total > 0 && (
                    <div className="w-full">
                      <div className="mb-1 flex justify-between text-xs text-slate-500">
                        <span>{t('purchasing.readiness.checklist')}</span>
                        <span className="tabular-nums">{t('purchasing.readiness.progress', { ready: r.ready, total: r.total })}</span>
                      </div>
                      <div className="h-1.5 overflow-hidden rounded-full bg-slate-200 dark:bg-slate-700">
                        <div className={cn('h-full rounded-full', r.status === 'at_risk' ? 'bg-red-500' : 'bg-green-500')} style={{ width: `${(r.ready / r.total) * 100}%` }} />
                      </div>
                    </div>
                  )}
                </header>
                {r.total === 0 ? (
                  <p className="p-4 text-sm text-slate-500">{t('purchasing.readiness.noMaterials')}</p>
                ) : (
                  <ul className="divide-y divide-slate-100 dark:divide-slate-800">
                    {r.items.map((i) => (
                      <ChecklistRow key={i.view.material.id} item={i} />
                    ))}
                  </ul>
                )}
              </article>
            );
          })}
        </div>
      )}
    </div>
  );
}

function ChecklistRow({ item }: { item: ReadinessItem }) {
  const { t } = useI18n();
  const m = item.view.material;
  const [Icon, color] =
    item.state === 'ok'
      ? [CheckCircle2, 'text-green-600']
      : item.state === 'awaiting'
        ? [Truck, 'text-blue-600']
        : item.state === 'risk'
          ? [AlertTriangle, 'text-red-600']
          : [ShoppingCart, 'text-amber-600'];

  const text =
    item.state === 'ok'
      ? t('purchasing.readiness.ok')
      : item.state === 'awaiting'
        ? item.eta
          ? t('purchasing.readiness.awaiting', { date: formatDate(item.eta) })
          : t('purchasing.readiness.awaitingNoDate')
        : item.state === 'risk'
          ? item.view.status === 'to_buy'
            ? t('purchasing.readiness.riskToBuy', { date: item.eta ? formatDate(item.eta) : '—' })
            : item.view.late
              ? t('purchasing.readiness.riskLate', { date: formatDate(item.eta ?? '') })
              : t('purchasing.readiness.risk', { date: formatDate(item.eta ?? '') })
          : t('purchasing.readiness.toBuy');

  return (
    <li className="flex items-start gap-3 px-4 py-2.5 text-sm">
      {item.state === 'ok' ? <Icon className={cn('mt-0.5 size-4 shrink-0', color)} /> : item.state === 'to_buy' ? <CircleDashed className={cn('mt-0.5 size-4 shrink-0', color)} /> : <Icon className={cn('mt-0.5 size-4 shrink-0', color)} />}
      <div className="min-w-0 flex-1">
        <p className={cn('font-medium', item.state === 'ok' && 'text-slate-500 line-through decoration-slate-300')}>
          {m.description} <span className="text-xs font-normal text-slate-500">× {m.quantity}</span>
        </p>
        <p className={cn('text-xs', color)}>{text}</p>
        {item.shared.length > 0 && (
          <p className="mt-0.5 flex items-center gap-1 text-xs font-medium text-violet-700 dark:text-violet-300">
            <Link2 className="size-3.5" />
            {t('purchasing.readiness.sharedWith', { list: item.shared.map((d) => `${d.project.projectNumber} (${d.material.quantity})`).join(', ') })}
          </p>
        )}
      </div>
      {item.view.status === 'to_buy' && <StatusBadge kind="quoteState" value={item.quote} />}
    </li>
  );
}
