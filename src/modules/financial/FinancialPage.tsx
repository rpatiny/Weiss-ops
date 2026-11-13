import { useEffect, useMemo, useState } from 'react';
import { AlertTriangle, CircleDollarSign, Hourglass, LineChart, Percent, Plus, Search, TrendingUp, Trophy } from 'lucide-react';
import { clearParams, navigate, useRoute } from '@/app/router';
import { useCan } from '@/app/session';
import { Badge, StatusBadge } from '@/components/ui/Badge';
import { Button } from '@/components/ui/Button';
import { Input, Select } from '@/components/ui/Field';
import { EmptyState, PageHeader, StatCard } from '@/components/ui/misc';
import { repos } from '@/data/db';
import { useCollection } from '@/data/hooks';
import {
  billedValue,
  customerRanking,
  deliveredIn,
  forecastNextMonths,
  isBacklog,
  monthlySeries,
  quoteStats,
  weightedValue,
} from '@/domain/financial';
import { enumLabel, enumOptions } from '@/domain/labels';
import { useI18n } from '@/i18n';
import { cn } from '@/lib/cn';
import { monthKey, todayISO } from '@/lib/dates';
import { formatCurrency, formatDate, formatMonthYear, formatPercent } from '@/lib/format';
import { usePersistentState } from '@/lib/usePersistentState';
import type { QuoteStatus, SpindleStatus, SpindleUnit } from '@/types/models';
import { ActualForecastChart } from './ActualForecastChart';
import { ForecastDrawer, SpindleDrawer } from './FinancialDrawers';

type Tab = 'overview' | 'spindles' | 'quotes' | 'deliveries' | 'forecast';
const TABS: Tab[] = ['overview', 'spindles', 'quotes', 'deliveries', 'forecast'];
const isTab = (v: unknown): v is Tab => typeof v === 'string' && (TABS as string[]).includes(v);

export function FinancialPage() {
  const { t } = useI18n();
  const allowed = useCan();
  const { params, path } = useRoute();
  const [tab, setTab] = usePersistentState<Tab>('financial.tab', 'overview', isTab);
  const [spindle, setSpindle] = useState<{ id?: string } | null>(null);
  const [fc, setFc] = useState<{ id?: string } | null>(null);

  // Deep-link: #/financial?open=<spindleId>
  const openParam = path === '/financial' ? params.get('open') : null;
  useEffect(() => {
    if (!openParam) return;
    if (repos.spindles.getById(openParam)) {
      setTab('spindles');
      setSpindle({ id: openParam });
    }
    clearParams('open');
  }, [openParam]);

  const canEdit = allowed('financial.edit');

  return (
    <>
      <PageHeader
        icon={LineChart}
        title={t('financial.title')}
        description={t('financial.description')}
        actions={
          canEdit && (
            <>
              <Button icon={TrendingUp} onClick={() => setFc({})}>
                {t('financial.newForecast')}
              </Button>
              <Button variant="primary" icon={Plus} onClick={() => setSpindle({})}>
                {t('financial.newSpindle')}
              </Button>
            </>
          )
        }
      />

      <div className="mb-5 flex gap-1 overflow-x-auto border-b border-slate-200 dark:border-slate-800" role="tablist">
        {TABS.map((x) => (
          <button
            key={x}
            role="tab"
            aria-selected={tab === x}
            onClick={() => setTab(x)}
            className={cn(
              '-mb-px border-b-2 px-4 py-2 text-sm font-medium whitespace-nowrap transition-colors',
              tab === x ? 'border-brand-500 text-slate-900 dark:text-white' : 'border-transparent text-slate-500 hover:text-slate-800 dark:hover:text-slate-200',
            )}
          >
            {t(`financial.tabs.${x}`)}
          </button>
        ))}
      </div>

      {tab === 'overview' && <Overview onOpenSpindle={(id) => setSpindle({ id })} />}
      {tab === 'spindles' && <SpindlesTab onOpen={(id) => setSpindle({ id })} />}
      {tab === 'quotes' && <QuotesTab onOpen={(id) => setSpindle({ id })} />}
      {tab === 'deliveries' && <DeliveriesTab onOpen={(id) => setSpindle({ id })} />}
      {tab === 'forecast' && <ForecastTab onOpen={(id) => setFc({ id })} />}

      <SpindleDrawer open={!!spindle} spindleId={spindle?.id} onClose={() => setSpindle(null)} />
      <ForecastDrawer open={!!fc} forecastId={fc?.id} onClose={() => setFc(null)} />
    </>
  );
}

// ───────────── Visão geral ─────────────

function Overview({ onOpenSpindle }: { onOpenSpindle: (id: string) => void }) {
  const { t } = useI18n();
  const spindles = useCollection('spindles');
  const forecast = useCollection('forecast');
  const today = todayISO();

  const month = deliveredIn(spindles, monthKey(today));
  const backlog = spindles.filter(isBacklog);
  const backlogValue = backlog.reduce((s, x) => s + (x.quotedValue || 0), 0);
  const qs = quoteStats(spindles);
  const next3 = forecastNextMonths(forecast, 3, today);
  const series = useMemo(() => monthlySeries(spindles, forecast, 5, 6, today), [spindles, forecast, today]);
  const ranking = useMemo(() => customerRanking(spindles, forecast), [spindles, forecast]);
  const maxInvoiced = Math.max(1, ...ranking.map((r) => r.invoiced));

  return (
    <div className="space-y-6">
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 xl:grid-cols-4">
        <StatCard label={t('financial.kpi.invoicedMonth')} value={formatCurrency(month.total)} icon={CircleDollarSign} tone="success" hint={t('financial.kpi.invoicedMonthHint', { count: month.count })} />
        <StatCard label={t('financial.kpi.backlog')} value={formatCurrency(backlogValue)} icon={Hourglass} tone="warning" hint={t('financial.kpi.backlogHint', { value: formatCurrency(qs.sentValue) })} />
        <StatCard label={t('financial.kpi.forecast3')} value={formatCurrency(next3.weighted)} icon={TrendingUp} tone="info" hint={t('financial.kpi.forecast3Hint', { value: formatCurrency(next3.gross) })} />
        <StatCard
          label={t('financial.kpi.approvalRate')}
          value={qs.approvalRate === null ? '—' : formatPercent(qs.approvalRate, 1)}
          icon={Percent}
          hint={qs.approvalRate === null ? t('financial.kpi.noDecisions') : t('financial.kpi.approvalRateHint', { approved: qs.approved, declined: qs.declined })}
        />
      </div>

      <ActualForecastChart data={series} />

      <section className="card overflow-hidden">
        <div className="flex items-center gap-2 border-b border-slate-200 px-5 py-3 dark:border-slate-800">
          <Trophy className="size-5 text-brand-500" />
          <div>
            <h2 className="font-semibold text-slate-900 dark:text-white">{t('financial.ranking.title')}</h2>
            <p className="text-xs text-slate-500">{t('financial.ranking.subtitle')}</p>
          </div>
        </div>
        {ranking.length === 0 ? (
          <EmptyState icon={Trophy} title={t('financial.ranking.empty')} />
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full min-w-[720px]">
              <thead className="bg-slate-50 dark:bg-slate-800/50">
                <tr>
                  <th className="th w-10">#</th>
                  <th className="th">{t('financial.ranking.customer')}</th>
                  <th className="th w-64">{t('financial.ranking.invoiced')}</th>
                  <th className="th text-right">{t('financial.ranking.units')}</th>
                  <th className="th text-right">{t('financial.ranking.delivered')}</th>
                  <th className="th text-right">{t('financial.ranking.backlog')}</th>
                  <th className="th text-right">{t('financial.ranking.forecast')}</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100 dark:divide-slate-800">
                {ranking.map((r, i) => (
                  <tr key={r.customer} className="hover:bg-slate-50 dark:hover:bg-slate-800/40">
                    <td className="td font-mono text-xs text-slate-500">{i + 1}</td>
                    <td className="td font-medium">{r.customer}</td>
                    <td className="td">
                      <div className="flex items-center gap-2">
                        <div className="h-2 flex-1 overflow-hidden rounded-full bg-slate-100 dark:bg-slate-800">
                          <div className="h-full rounded-full" style={{ width: `${(r.invoiced / maxInvoiced) * 100}%`, backgroundColor: 'var(--series-actual)' }} />
                        </div>
                        <span className="w-28 text-right text-sm font-semibold tabular-nums">{formatCurrency(r.invoiced)}</span>
                      </div>
                    </td>
                    <td className="td text-right tabular-nums">{r.units}</td>
                    <td className="td text-right tabular-nums">{r.delivered}</td>
                    <td className="td text-right text-sm tabular-nums">{r.backlog ? formatCurrency(r.backlog) : '—'}</td>
                    <td className="td text-right text-sm tabular-nums">{r.forecastWeighted ? formatCurrency(r.forecastWeighted) : '—'}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>

      {backlog.length > 0 && (
        <section className="card p-5">
          <h2 className="mb-3 font-semibold text-slate-900 dark:text-white">{t('financial.kpi.backlog')}</h2>
          <div className="flex flex-wrap gap-2">
            {backlog.map((s) => (
              <button key={s.id} onClick={() => onOpenSpindle(s.id)} className="flex max-w-full flex-wrap items-center gap-x-2 gap-y-1 rounded-lg border border-slate-200 px-3 py-1.5 text-left text-sm hover:border-brand-500 dark:border-slate-700">
                <span className="font-mono text-xs">{s.serialNumber}</span>
                <span className="text-slate-500">{s.customer}</span>
                <StatusBadge kind="spindleStatus" value={s.status} />
                <span className="font-medium tabular-nums">{formatCurrency(s.quotedValue)}</span>
              </button>
            ))}
          </div>
        </section>
      )}
    </div>
  );
}

// ───────────── Spindles ─────────────

function SpindlesTab({ onOpen }: { onOpen: (id: string) => void }) {
  const { t } = useI18n();
  const spindles = useCollection('spindles');
  const pos = useCollection('purchaseOrders');
  const [query, setQuery] = useState('');
  const [status, setStatus] = useState<'all' | SpindleStatus>('all');

  const rows = spindles
    .filter((s) => status === 'all' || s.status === status)
    .filter((s) => {
      const q = query.trim().toLowerCase();
      return !q || [s.serialNumber, s.model, s.manufacturer, s.customer, s.quoteNumber].some((f) => f.toLowerCase().includes(q));
    })
    .sort((a, b) => b.receivedDate.localeCompare(a.receivedDate));

  return (
    <div className="card overflow-hidden">
      <div className="flex flex-col gap-3 border-b border-slate-200 p-4 sm:flex-row dark:border-slate-800">
        <div className="relative flex-1">
          <Search className="pointer-events-none absolute top-1/2 left-3 size-4 -translate-y-1/2 text-slate-400" />
          <input className="input pl-9" placeholder={t('financial.spindles.search')} value={query} onChange={(e) => setQuery(e.target.value)} aria-label={t('common.search')} />
        </div>
        <Select<'all' | SpindleStatus> className="sm:w-52" value={status} onChange={setStatus} options={[{ value: 'all', label: t('financial.spindles.allStatuses') }, ...enumOptions(t, 'spindleStatus')]} aria-label={t('common.status')} />
      </div>
      {rows.length === 0 ? (
        <EmptyState icon={LineChart} title={t('financial.spindles.empty')} />
      ) : (
        <div className="overflow-x-auto">
          <table className="w-full min-w-[980px]">
            <thead className="bg-slate-50 dark:bg-slate-800/50">
              <tr>
                <th className="th">{t('financial.spindles.serial')}</th>
                <th className="th">{t('financial.spindles.equipment')}</th>
                <th className="th">{t('financial.spindles.customer')}</th>
                <th className="th">{t('financial.spindles.received')}</th>
                <th className="th">{t('financial.spindles.quote')}</th>
                <th className="th">{t('common.status')}</th>
                <th className="th">{t('financial.spindles.delivery')}</th>
                <th className="th text-right">{t('financial.spindles.invoiced')}</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100 dark:divide-slate-800">
              {rows.map((s) => {
                const po = pos.find((p) => p.id === s.poId);
                return (
                  <tr key={s.id} onClick={() => onOpen(s.id)} className="cursor-pointer hover:bg-slate-50 dark:hover:bg-slate-800/40">
                    <td className="td font-mono text-sm font-semibold">{s.serialNumber}</td>
                    <td className="td">
                      <p className="font-medium">{s.manufacturer}</p>
                      <p className="text-xs text-slate-500">{s.model}</p>
                    </td>
                    <td className="td text-sm">{s.customer}</td>
                    <td className="td text-sm">{formatDate(s.receivedDate)}</td>
                    <td className="td text-sm">
                      <p className="font-mono text-xs">{s.quoteNumber || '—'}</p>
                      <p className="flex items-center gap-1.5">
                        <span className="tabular-nums">{s.quotedValue ? formatCurrency(s.quotedValue) : '—'}</span>
                        <StatusBadge kind="quoteStatus" value={s.quoteStatus} />
                      </p>
                    </td>
                    <td className="td">
                      <StatusBadge kind="spindleStatus" value={s.status} />
                      {po && (
                        <button type="button" onClick={(e) => { e.stopPropagation(); navigate('/purchase-orders', { open: po.id }); }} className="mt-1 block font-mono text-[11px] text-brand-700 hover:underline dark:text-brand-400">
                          PO {po.poNumber}
                        </button>
                      )}
                    </td>
                    <td className="td text-sm">{formatDate(s.deliveryDate)}</td>
                    <td className="td text-right text-sm font-medium tabular-nums">{s.status === 'delivered' ? formatCurrency(billedValue(s)) : '—'}</td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}

// ───────────── Cotações ─────────────

function QuotesTab({ onOpen }: { onOpen: (id: string) => void }) {
  const { t } = useI18n();
  const spindles = useCollection('spindles');
  const qs = quoteStats(spindles);
  const columns: QuoteStatus[] = ['pending', 'sent', 'approved', 'declined'];

  return (
    <div className="space-y-5">
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
        <StatCard label={t('financial.kpi.approvalRate')} value={qs.approvalRate === null ? '—' : formatPercent(qs.approvalRate, 1)} icon={Percent} tone="success" hint={t('financial.quotes.rateHint')} />
        <StatCard label={t('financial.quotes.sentValue')} value={formatCurrency(qs.sentValue)} icon={Hourglass} tone="info" hint={`${qs.sent} · ${enumLabel(t, 'quoteStatus', 'sent')}`} />
        <StatCard label={t('financial.quotes.approvedValue')} value={formatCurrency(qs.approvedValue)} icon={CircleDollarSign} tone="success" hint={`${qs.approved} · ${enumLabel(t, 'quoteStatus', 'approved')}`} />
      </div>
      <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
        {columns.map((c) => {
          const items = spindles.filter((s) => s.quoteStatus === c).sort((a, b) => b.receivedDate.localeCompare(a.receivedDate));
          return (
            <section key={c} className="card overflow-hidden">
              <header className="flex items-center justify-between border-b border-slate-200 px-4 py-2.5 dark:border-slate-800">
                <StatusBadge kind="quoteStatus" value={c} />
                <span className="text-xs text-slate-500 tabular-nums">
                  {items.length} · {formatCurrency(items.reduce((s, x) => s + (x.quotedValue || 0), 0))}
                </span>
              </header>
              {items.length === 0 ? (
                <p className="p-4 text-sm text-slate-500">{t('financial.quotes.empty')}</p>
              ) : (
                <ul className="divide-y divide-slate-100 dark:divide-slate-800">
                  {items.map((s) => (
                    <li key={s.id}>
                      <button type="button" onClick={() => onOpen(s.id)} className="block w-full px-4 py-2.5 text-left text-sm hover:bg-slate-50 dark:hover:bg-slate-800/40">
                        <p className="flex justify-between gap-2">
                          <span className="font-mono text-xs">{s.quoteNumber || s.serialNumber}</span>
                          <span className="font-semibold tabular-nums">{s.quotedValue ? formatCurrency(s.quotedValue) : '—'}</span>
                        </p>
                        <p className="truncate font-medium">{s.customer}</p>
                        <p className="text-xs text-slate-500">
                          {s.manufacturer} {s.model} · {formatDate(s.receivedDate)}
                        </p>
                      </button>
                    </li>
                  ))}
                </ul>
              )}
            </section>
          );
        })}
      </div>
    </div>
  );
}

// ───────────── Entregas do mês ─────────────

function DeliveriesTab({ onOpen }: { onOpen: (id: string) => void }) {
  const { t } = useI18n();
  const spindles = useCollection('spindles');
  const [ym, setYm] = useState(monthKey(todayISO()));
  const m = deliveredIn(spindles, ym);

  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-center gap-3">
        <label htmlFor="del-month" className="text-sm font-medium">
          {t('financial.deliveries.month')}
        </label>
        <Input id="del-month" type="month" value={ym} onChange={(e) => e.target.value && setYm(e.target.value)} className="w-48" />
        <span className="text-sm text-slate-500">{formatMonthYear(`${ym}-01`)}</span>
      </div>
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
        <StatCard label={t('financial.deliveries.count')} value={m.count} icon={TrendingUp} tone="info" />
        <StatCard label={t('financial.deliveries.total')} value={formatCurrency(m.total)} icon={CircleDollarSign} tone="success" />
        <StatCard label={t('financial.deliveries.avg')} value={m.count ? formatCurrency(m.total / m.count) : '—'} icon={Percent} />
      </div>
      {m.missingInvoice > 0 && (
        <p className="flex items-center gap-2 rounded-lg border border-amber-300 bg-amber-50 px-3 py-2 text-sm text-amber-800 dark:border-amber-900 dark:bg-amber-950/30 dark:text-amber-300">
          <AlertTriangle className="size-4" /> {t('financial.deliveries.missingInvoice', { count: m.missingInvoice })}
        </p>
      )}
      <div className="card overflow-hidden">
        {m.items.length === 0 ? (
          <EmptyState icon={TrendingUp} title={t('financial.deliveries.empty')} />
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full min-w-[640px]">
              <thead className="bg-slate-50 dark:bg-slate-800/50">
                <tr>
                  <th className="th">{t('financial.spindles.serial')}</th>
                  <th className="th">{t('financial.spindles.equipment')}</th>
                  <th className="th">{t('financial.spindles.customer')}</th>
                  <th className="th">{t('financial.spindles.delivery')}</th>
                  <th className="th text-right">{t('financial.spindles.invoiced')}</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100 dark:divide-slate-800">
                {[...m.items].sort((a, b) => (a.deliveryDate ?? '').localeCompare(b.deliveryDate ?? '')).map((s: SpindleUnit) => (
                  <tr key={s.id} onClick={() => onOpen(s.id)} className="cursor-pointer hover:bg-slate-50 dark:hover:bg-slate-800/40">
                    <td className="td font-mono text-sm">{s.serialNumber}</td>
                    <td className="td text-sm">
                      {s.manufacturer} {s.model}
                    </td>
                    <td className="td text-sm">{s.customer}</td>
                    <td className="td text-sm">{formatDate(s.deliveryDate)}</td>
                    <td className="td text-right font-medium tabular-nums">
                      {formatCurrency(billedValue(s))}
                      {s.invoicedValue === undefined && <Badge tone="amber" className="ml-2">*</Badge>}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  );
}

// ───────────── Forecast ─────────────

function ForecastTab({ onOpen }: { onOpen: (id: string) => void }) {
  const { t } = useI18n();
  const forecast = useCollection('forecast');
  const today = todayISO();
  const rows = [...forecast].sort((a, b) => a.expectedDate.localeCompare(b.expectedDate));
  const total = rows.reduce((s, f) => s + f.estimatedValue, 0);
  const weighted = rows.reduce((s, f) => s + weightedValue(f), 0);

  return (
    <div className="space-y-5">
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
        <StatCard label={t('financial.forecast.total')} value={formatCurrency(total)} icon={TrendingUp} />
        <StatCard label={t('financial.forecast.weightedTotal')} value={formatCurrency(weighted)} icon={TrendingUp} tone="info" />
      </div>
      <div className="card overflow-hidden">
        {rows.length === 0 ? (
          <EmptyState icon={TrendingUp} title={t('financial.forecast.empty')} />
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full min-w-[820px]">
              <thead className="bg-slate-50 dark:bg-slate-800/50">
                <tr>
                  <th className="th">{t('financial.forecast.customer')}</th>
                  <th className="th">{t('financial.forecast.model')}</th>
                  <th className="th">{t('financial.forecast.expectedDate')}</th>
                  <th className="th text-right">{t('financial.forecast.estimatedValue')}</th>
                  <th className="th w-44">{t('financial.forecast.probability')}</th>
                  <th className="th text-right">{t('financial.forecast.weighted')}</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100 dark:divide-slate-800">
                {rows.map((f) => {
                  const past = f.expectedDate < today;
                  return (
                    <tr key={f.id} onClick={() => onOpen(f.id)} className="cursor-pointer hover:bg-slate-50 dark:hover:bg-slate-800/40">
                      <td className="td font-medium">{f.customer}</td>
                      <td className="td">
                        <p className="text-sm">{f.spindleModel}</p>
                        {f.description && <p className="text-xs text-slate-500">{f.description}</p>}
                      </td>
                      <td className={cn('td text-sm', past && 'text-red-600')}>
                        {formatDate(f.expectedDate)}
                        {past && <span className="block text-[11px]">{t('financial.forecast.past')}</span>}
                      </td>
                      <td className="td text-right tabular-nums">{formatCurrency(f.estimatedValue)}</td>
                      <td className="td">
                        <div className="flex items-center gap-2">
                          <div className="h-2 flex-1 overflow-hidden rounded-full bg-slate-100 dark:bg-slate-800">
                            <div className="h-full rounded-full" style={{ width: `${f.probability}%`, backgroundColor: 'var(--series-forecast)' }} />
                          </div>
                          <span className="w-10 text-right text-xs tabular-nums">{f.probability}%</span>
                        </div>
                      </td>
                      <td className="td text-right font-semibold tabular-nums">{formatCurrency(weightedValue(f))}</td>
                    </tr>
                  );
                })}
              </tbody>
              <tfoot>
                <tr className="bg-slate-50 font-semibold dark:bg-slate-800/50">
                  <td className="td" colSpan={3} />
                  <td className="td text-right tabular-nums">{formatCurrency(total)}</td>
                  <td />
                  <td className="td text-right tabular-nums">{formatCurrency(weighted)}</td>
                </tr>
              </tfoot>
            </table>
          </div>
        )}
      </div>
    </div>
  );
}

