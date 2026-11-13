import { useState } from 'react';
import { BarChart3, Table2 } from 'lucide-react';
import { Bar, BarChart, CartesianGrid, ReferenceArea, ResponsiveContainer, Tooltip, XAxis, YAxis, type TooltipContentProps, type TooltipValueType } from 'recharts';
type TipProps = TooltipContentProps<TooltipValueType, string | number>;
import { Button } from '@/components/ui/Button';
import type { MonthPoint } from '@/domain/financial';
import { useI18n } from '@/i18n';
import { cn } from '@/lib/cn';
import { formatCurrency, formatCurrencyCompact, getFormatLocale } from '@/lib/format';
import { parseISODate } from '@/lib/dates';

const monthLabel = (ym: string) => {
  const s = parseISODate(`${ym}-01`).toLocaleDateString(getFormatLocale(), { month: 'short', year: '2-digit' }).replace('.', '');
  return s.charAt(0).toUpperCase() + s.slice(1);
};

/** Barras agrupadas: faturado (realizado) × forecast ponderado por mês. Uma escala só (moeda). */
export function ActualForecastChart({ data }: { data: MonthPoint[] }) {
  const { t } = useI18n();
  const [asTable, setAsTable] = useState(false);
  const current = data.find((d) => d.isCurrent)?.month;

  const series = [
    { key: 'actual' as const, label: t('financial.chart.actual'), color: 'var(--series-actual)' },
    { key: 'forecast' as const, label: t('financial.chart.forecast'), color: 'var(--series-forecast)' },
  ];

  return (
    <section className="card p-5">
      <div className="mb-4 flex flex-wrap items-start justify-between gap-3">
        <div>
          <h2 className="font-semibold text-slate-900 dark:text-white">{t('financial.chart.title')}</h2>
          <p className="text-xs text-slate-500">{t('financial.chart.subtitle')}</p>
        </div>
        <div className="flex items-center gap-4">
          {/* Legenda (identidade nunca só pela cor: rótulos ao lado das amostras) */}
          <ul className="flex flex-wrap gap-4 text-xs text-slate-600 dark:text-slate-300">
            {series.map((s) => (
              <li key={s.key} className="flex items-center gap-1.5">
                <span className="size-3 rounded-sm" style={{ backgroundColor: s.color }} aria-hidden />
                {s.label}
              </li>
            ))}
          </ul>
          <Button size="sm" icon={asTable ? BarChart3 : Table2} onClick={() => setAsTable((v) => !v)}>
            {asTable ? t('financial.chart.showChart') : t('financial.chart.showTable')}
          </Button>
        </div>
      </div>

      {asTable ? (
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead className="bg-slate-50 dark:bg-slate-800/50">
              <tr>
                <th className="th">{t('financial.chart.month')}</th>
                <th className="th text-right">{t('financial.chart.actual')}</th>
                <th className="th text-right">{t('financial.chart.forecast')}</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100 dark:divide-slate-800">
              {data.map((d) => (
                <tr key={d.month} className={cn(d.isCurrent && 'bg-brand-50/60 font-medium dark:bg-brand-500/10')}>
                  <td className="td">
                    {monthLabel(d.month)} {d.isCurrent && <span className="text-xs text-slate-500">· {t('financial.chart.current')}</span>}
                  </td>
                  <td className="td text-right tabular-nums">{formatCurrency(d.actual)}</td>
                  <td className="td text-right tabular-nums">{formatCurrency(d.forecast)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      ) : (
        <div className="h-72 w-full" role="img" aria-label={t('financial.chart.title')}>
          <ResponsiveContainer width="100%" height="100%">
            <BarChart data={data} barGap={2} barCategoryGap="22%" margin={{ top: 8, right: 8, left: 8, bottom: 0 }}>
              <CartesianGrid vertical={false} stroke="var(--chart-grid)" />
              {current && <ReferenceArea x1={current} x2={current} fill="var(--chart-current)" ifOverflow="extendDomain" />}
              <XAxis dataKey="month" tickFormatter={monthLabel} tick={{ fill: 'var(--chart-text)', fontSize: 11 }} axisLine={{ stroke: 'var(--chart-grid)' }} tickLine={false} />
              <YAxis tickFormatter={(v: number) => formatCurrencyCompact(v)} tick={{ fill: 'var(--chart-text)', fontSize: 11 }} axisLine={false} tickLine={false} width={72} />
              <Tooltip cursor={{ fill: 'var(--chart-grid)', fillOpacity: 0.5 }} content={(p: TipProps) => <ChartTooltip {...p} series={series} />} />
              {series.map((s) => (
                <Bar key={s.key} dataKey={s.key} name={s.label} fill={s.color} radius={[4, 4, 0, 0]} maxBarSize={28} isAnimationActive={false} />
              ))}
            </BarChart>
          </ResponsiveContainer>
        </div>
      )}
    </section>
  );
}

function ChartTooltip({ active, payload, label, series }: TipProps & { series: { key: string; label: string; color: string }[] }) {
  const { t } = useI18n();
  if (!active || !payload?.length) return null;
  const point = payload[0]?.payload as MonthPoint | undefined;
  return (
    <div className="card px-3 py-2 text-xs shadow-lg">
      <p className="mb-1 font-semibold text-slate-900 dark:text-white">
        {monthLabel(String(label))} {point?.isCurrent && <span className="font-normal text-slate-500">· {t('financial.chart.current')}</span>}
      </p>
      {series.map((s) => (
        <p key={s.key} className="flex items-center justify-between gap-4 text-slate-600 dark:text-slate-300">
          <span className="flex items-center gap-1.5">
            <span className="size-2.5 rounded-sm" style={{ backgroundColor: s.color }} />
            {s.label}
          </span>
          <span className="font-medium text-slate-900 tabular-nums dark:text-white">{formatCurrency(Number(point?.[s.key as 'actual' | 'forecast'] ?? 0))}</span>
        </p>
      ))}
    </div>
  );
}
