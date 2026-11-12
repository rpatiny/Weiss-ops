import { useMemo, useState } from 'react';
import { Boxes, Link2, Plus, Search, Star } from 'lucide-react';
import { Badge, StatusBadge } from '@/components/ui/Badge';
import { Button } from '@/components/ui/Button';
import { EmptyState } from '@/components/ui/misc';
import { bestOffer, fastestOffer, normPN, offerViews, quoteState, type DemandItem } from '@/domain/purchasing';
import { useI18n } from '@/i18n';
import { cn } from '@/lib/cn';
import { formatCurrency, formatDate } from '@/lib/format';
import type { CatalogMaterial } from '@/types/models';
import { CatalogDrawer } from './CatalogDrawer';
import { usePurchasingData } from './usePurchasingData';

type Filter = 'all' | 'not_quoted' | 'to_buy' | 'shared';

interface Row {
  key: string;
  cat?: CatalogMaterial;
  partNumber: string;
  description: string;
  demand: DemandItem[];
}

export function CatalogTab() {
  const { t } = useI18n();
  const pd = usePurchasingData();
  const [query, setQuery] = useState('');
  const [filter, setFilter] = useState<Filter>('all');
  const [drawer, setDrawer] = useState<{ id?: string; prefill?: { partNumber: string; description: string } } | null>(null);

  /** Catálogo + materiais usados em projetos que ainda não estão no catálogo. */
  const rows = useMemo<Row[]>(() => {
    const out: Row[] = pd.catalog.map((cat) => ({ key: normPN(cat.partNumber), cat, partNumber: cat.partNumber, description: cat.description, demand: pd.demand.get(normPN(cat.partNumber)) ?? [] }));
    const known = new Set(out.map((r) => r.key));
    for (const [key, demand] of pd.demand) if (!known.has(key)) out.push({ key, partNumber: demand[0]!.material.partNumber, description: demand[0]!.material.description, demand });
    return out.sort((a, b) => b.demand.length - a.demand.length || a.partNumber.localeCompare(b.partNumber));
  }, [pd]);

  const filtered = rows.filter((r) => {
    const q = query.trim().toLowerCase();
    if (q && !`${r.partNumber} ${r.description}`.toLowerCase().includes(q)) return false;
    if (filter === 'not_quoted') return quoteState(r.cat, pd.today) === 'not_quoted';
    if (filter === 'to_buy') return r.demand.some((d) => d.view.status === 'to_buy');
    if (filter === 'shared') return new Set(r.demand.map((d) => d.project.id)).size > 1;
    return true;
  });

  const filters: { id: Filter; label: string }[] = [
    { id: 'all', label: t('purchasing.materials.filterAll') },
    { id: 'to_buy', label: t('purchasing.materials.filterToBuy') },
    { id: 'not_quoted', label: t('purchasing.materials.filterNotQuoted') },
    { id: 'shared', label: t('purchasing.materials.filterShared') },
  ];

  return (
    <div className="card overflow-hidden">
      <div className="flex flex-col gap-3 border-b border-slate-200 p-4 lg:flex-row lg:items-center dark:border-slate-800">
        <div className="relative flex-1">
          <Search className="pointer-events-none absolute top-1/2 left-3 size-4 -translate-y-1/2 text-slate-400" />
          <input className="input pl-9" placeholder={t('purchasing.materials.search')} value={query} onChange={(e) => setQuery(e.target.value)} aria-label={t('common.search')} />
        </div>
        <div className="flex flex-wrap gap-1">
          {filters.map((f) => (
            <button
              key={f.id}
              onClick={() => setFilter(f.id)}
              aria-pressed={filter === f.id}
              className={cn(
                'rounded-full border px-3 py-1 text-xs font-medium',
                filter === f.id ? 'border-slate-900 bg-slate-900 text-white dark:border-white dark:bg-white dark:text-slate-900' : 'border-slate-300 text-slate-600 hover:bg-slate-100 dark:border-slate-700 dark:text-slate-400 dark:hover:bg-slate-800',
              )}
            >
              {f.label}
            </button>
          ))}
        </div>
        <Button variant="primary" icon={Plus} onClick={() => setDrawer({})}>
          {t('purchasing.materials.newMaterial')}
        </Button>
      </div>

      {filtered.length === 0 ? (
        <EmptyState icon={Boxes} title={t('purchasing.materials.empty')} />
      ) : (
        <div className="overflow-x-auto">
          <table className="w-full min-w-[1100px]">
            <thead className="bg-slate-50 dark:bg-slate-800/50">
              <tr>
                <th className="th w-64">{t('purchasing.materials.material')}</th>
                <th className="th">{t('purchasing.materials.suppliers')}</th>
                <th className="th w-60">{t('purchasing.materials.demand')}</th>
                <th className="th w-32">{t('purchasing.materials.quote')}</th>
                <th className="th w-44">{t('purchasing.materials.eta')}</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100 dark:divide-slate-800">
              {filtered.map((r) => {
                const offers = r.cat ? offerViews(r.cat, pd.suppliersById, pd.purchaseOrders, pd.today) : [];
                const best = bestOffer(offers);
                const fastest = fastestOffer(offers);
                const projectsUsing = [...new Map(r.demand.map((d) => [d.project.id, d.project])).values()];
                const qty = (st: string) => r.demand.filter((d) => d.view.status === st).reduce((s, d) => s + d.material.quantity, 0);
                const totalQty = r.demand.reduce((s, d) => s + d.material.quantity, 0);
                const ordered = r.demand.filter((d) => d.view.status === 'ordered' && d.view.expectedDate).map((d) => d.view.expectedDate!).sort()[0];
                const toBuy = qty('to_buy');
                return (
                  <tr key={r.key} onClick={() => setDrawer(r.cat ? { id: r.cat.id } : { prefill: { partNumber: r.partNumber, description: r.description } })} className="cursor-pointer align-top hover:bg-slate-50 dark:hover:bg-slate-800/40">
                    <td className="td">
                      <p className="font-mono text-xs text-slate-500">{r.partNumber || '—'}</p>
                      <p className="font-medium text-slate-900 dark:text-white">{r.description}</p>
                      {!r.cat && (
                        <span className="mt-1 inline-flex items-center gap-2">
                          <Badge tone="orange">{t('purchasing.materials.notInCatalog')}</Badge>
                          <span className="text-xs font-medium text-brand-700 dark:text-brand-400">+ {t('purchasing.materials.addToCatalog')}</span>
                        </span>
                      )}
                    </td>
                    <td className="td">
                      {offers.length === 0 ? (
                        <span className="text-xs text-slate-400">{t('purchasing.materials.noSuppliers')}</span>
                      ) : (
                        <ul className="space-y-1">
                          {offers.map((o) => (
                            <li key={o.offer.supplierId} className="flex flex-wrap items-center gap-x-2 gap-y-0.5 text-xs">
                              {o === best && offers.length > 1 ? <Star className="size-3.5 fill-amber-400 text-amber-500" aria-label={t('purchasing.materials.best')} /> : <span className="size-3.5" />}
                              <span className="font-medium text-slate-800 dark:text-slate-200">{o.supplier?.name ?? '—'}</span>
                              <span className="text-slate-500">{o.last ? t('purchasing.materials.lastPaid', { price: formatCurrency(o.last.price) }) : '—'}</span>
                              {o.quoteValid ? (
                                <Badge tone="green">{t('purchasing.materials.quotedPrice', { price: formatCurrency(o.offer.quotedPrice!) })}</Badge>
                              ) : (
                                <StatusBadge kind="supplierQuoteStatus" value={o.offer.quoteStatus} />
                              )}
                              <span className="text-slate-500">{t('purchasing.materials.leadTime', { days: o.offer.leadTimeDays })}</span>
                            </li>
                          ))}
                        </ul>
                      )}
                    </td>
                    <td className="td text-xs">
                      {r.demand.length === 0 ? (
                        <span className="text-slate-400">{t('purchasing.materials.noDemand')}</span>
                      ) : (
                        <div className="space-y-1">
                          <p className="font-medium">{t('purchasing.materials.demandSummary', { qty: totalQty, unit: r.cat?.unit ?? '', count: projectsUsing.length })}</p>
                          <div className="flex flex-wrap gap-1">
                            {projectsUsing.map((p) => (
                              <span key={p.id} className="rounded px-1.5 py-0.5 font-mono text-[10px] text-white" style={{ backgroundColor: p.color }}>
                                {p.projectNumber}
                              </span>
                            ))}
                          </div>
                          {projectsUsing.length > 1 && (
                            <p className="flex items-center gap-1 font-semibold text-violet-700 dark:text-violet-300">
                              <Link2 className="size-3.5" /> {t('purchasing.materials.shared', { count: projectsUsing.length })}
                            </p>
                          )}
                          <p className="text-slate-500">
                            {[toBuy && t('purchasing.materials.toBuyQty', { qty: toBuy }), qty('ordered') && t('purchasing.materials.orderedQty', { qty: qty('ordered') }), qty('received') && t('purchasing.materials.receivedQty', { qty: qty('received') })].filter(Boolean).join(' · ')}
                          </p>
                        </div>
                      )}
                    </td>
                    <td className="td">
                      <StatusBadge kind="quoteState" value={quoteState(r.cat, pd.today)} />
                    </td>
                    <td className="td text-xs">
                      {ordered && <p>{formatDate(ordered)}</p>}
                      {fastest && (toBuy > 0 || !ordered) && (
                        <p className="text-slate-500">
                          {t('purchasing.materials.buyToday', { date: formatDate(fastest.possibleDate) })}
                          {fastest.supplier && <span className="block">({fastest.supplier.name})</span>}
                        </p>
                      )}
                      {!ordered && !fastest && '—'}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}

      <CatalogDrawer open={!!drawer} materialId={drawer?.id} prefill={drawer?.prefill} onClose={() => setDrawer(null)} />
    </div>
  );
}
