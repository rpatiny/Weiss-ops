import { useEffect, useMemo, useState } from 'react';
import { AlertTriangle, ClipboardCheck, ClipboardList, FileInput, PackageCheck, Plus, Search, ShoppingCart } from 'lucide-react';
import { useCan, useCurrentUser } from '@/app/session';
import { useCollection } from '@/data/hooks';
import { effectiveStatus, needsLogistics, openQty, requisitionItemViews } from '@/domain/requisitions';
import { GRDrawer } from './process/GRDrawer';
import { RequisitionWizardDrawer } from './process/RequisitionWizardDrawer';
import { ExtensionFormDrawer } from '@/modules/extensions/ExtensionFormDrawer';
import { FilePlus2, Globe2 } from 'lucide-react';
import { ReceivingTab, RequisitionsTab } from './process/ProcessTabs';
import { clearParams, useRoute } from '@/app/router';
import { Badge, StatusBadge } from '@/components/ui/Badge';
import { Button } from '@/components/ui/Button';
import { Select } from '@/components/ui/Field';
import { EmptyState, PageHeader, StatCard } from '@/components/ui/misc';
import { repos } from '@/data/db';
import { enumOptions } from '@/domain/labels';
import { isLineLate, isPOActive, isProjectActive, normPN, poTotal, quoteState } from '@/domain/purchasing';
import { useI18n } from '@/i18n';
import { cn } from '@/lib/cn';
import { addDays } from '@/lib/dates';
import { formatCurrency, formatCurrencyCompact, formatDate } from '@/lib/format';
import { usePersistentState } from '@/lib/usePersistentState';
import type { POKind, POStatus } from '@/types/models';
import { CatalogTab } from './CatalogTab';
import { PODrawer } from './PODrawer';
import { ReadinessTab } from './ReadinessTab';
import { SuppliersTab } from './SuppliersTab';
import { usePurchasingData } from './usePurchasingData';

type Tab = 'requisitions' | 'orders' | 'receiving' | 'materials' | 'readiness' | 'suppliers';
const TABS: Tab[] = ['requisitions', 'orders', 'receiving', 'materials', 'readiness', 'suppliers'];
const isTab = (v: unknown): v is Tab => typeof v === 'string' && (TABS as string[]).includes(v);

export function PurchaseOrdersPage() {
  const { t } = useI18n();
  const { params, path: routePath } = useRoute();
  const pd = usePurchasingData();
  const user = useCurrentUser();
  const allowed = useCan();
  const requisitions = useCollection('requisitions');
  const [tab, setTab] = usePersistentState<Tab>(`purchasing.tab.${user?.role ?? 'x'}`, user?.role === 'master' ? 'orders' : 'requisitions', isTab);
  const [drawer, setDrawer] = useState<{ id?: string } | null>(null);
  const [reqOpen, setReqOpen] = useState<string>();
  const [grPo, setGrPo] = useState<string>();
  const [wizard, setWizard] = useState(false);
  const [extForm, setExtForm] = useState(false);
  const reqParam = routePath === '/purchase-orders' ? params.get('req') : null;
  const grParam = routePath === '/purchase-orders' ? params.get('gr') : null;
  useEffect(() => {
    if (!reqParam && !grParam) return;
    if (reqParam && repos.requisitions.getById(reqParam)) {
      setTab('requisitions');
      setReqOpen(reqParam);
    }
    if (grParam && repos.purchaseOrders.getById(grParam)) {
      setTab('receiving');
      setGrPo(grParam);
    }
    clearParams('req', 'gr');
  }, [reqParam, grParam]);

  // Deep-link: #/purchase-orders?open=<poId>
  // Só trata o parâmetro quando a rota atual é desta página (evita "roubar" o deep-link de outra tela).
  const openParam = routePath === '/purchase-orders' ? params.get('open') : null;
  useEffect(() => {
    if (!openParam) return;
    if (repos.purchaseOrders.getById(openParam)) {
      setTab('orders');
      setDrawer({ id: openParam });
    }
    clearParams('open');
  }, [openParam]);

  // ───── KPIs ─────
  const in7 = addDays(pd.today, 7);
  const kpi = useMemo(() => {
    const active = pd.purchaseOrders.filter(isPOActive);
    const openLines = pd.purchaseOrders.filter((p) => p.status !== 'canceled').flatMap((p) => p.lines.filter((l) => l.status !== 'delivered' && l.status !== 'canceled'));
    const toBuyItems = [...pd.demand.values()].flat().filter((d) => d.view.status === 'to_buy');
    const notQuoted = new Set(toBuyItems.filter((d) => quoteState(pd.catalogByPN.get(normPN(d.material.partNumber)), pd.today) === 'not_quoted').map((d) => d.material.partNumber)).size;
    const horizon = addDays(pd.today, 14);
    const notReady = pd.projects.filter((p) => {
      if (!isProjectActive(p)) return false;
      const start = pd.starts.get(p.id);
      return !!start && start <= horizon && pd.readinessOf(p).status !== 'ready';
    }).length;
    return {
      open: active.length,
      openValue: active.reduce((s, p) => s + poTotal(p), 0),
      due7: openLines.filter((l) => l.expectedDeliveryDate >= pd.today && l.expectedDeliveryDate <= in7).length,
      late: openLines.filter((l) => isLineLate(l, pd.today)).length,
      toBuy: toBuyItems.length,
      notQuoted,
      notReady,
      pendingReq: requisitions.filter((r) => needsLogistics(effectiveStatus(r, requisitionItemViews(r, pd.projects.find((p) => p.id === r.projectId), pd.poById)))).length,
      pendingGR: pd.purchaseOrders.filter((p) => p.kind === 'purchase' && p.status !== 'canceled').flatMap((p) => p.lines).filter((l) => l.status !== 'canceled' && openQty(l) > 0),
    };
  }, [pd, in7, requisitions]);

  return (
    <>
      <PageHeader
        icon={ClipboardList}
        title={t('purchasing.title')}
        description={t('purchasing.description')}
        actions={
          <>
            {allowed('extension.request') && (
              <Button icon={Globe2} className="border-indigo-300 text-indigo-700 dark:border-indigo-800 dark:text-indigo-300" onClick={() => setExtForm(true)}>
                {t('extensions.new')}
              </Button>
            )}
            {allowed('requisition.create') && (
              <Button variant="primary" icon={FilePlus2} onClick={() => setWizard(true)}>
                {t('process.req.newButton')}
              </Button>
            )}
            {allowed('po.edit') && (
              <Button variant={allowed('requisition.create') ? 'secondary' : 'primary'} icon={Plus} onClick={() => setDrawer({})}>
                {t('purchasing.newPO')}
              </Button>
            )}
          </>
        }
      />

      <div className="mb-6 grid grid-cols-2 gap-3 md:grid-cols-3 2xl:grid-cols-6">
        <StatCard label={t('process.kpi.pendingRequisitions')} value={kpi.pendingReq} icon={FileInput} tone={kpi.pendingReq ? 'info' : 'default'} hint={t('process.kpi.pendingRequisitionsHint')} onClick={() => setTab('requisitions')} />
        <StatCard label={t('process.kpi.pendingGR')} value={kpi.pendingGR.length} icon={PackageCheck} tone={kpi.pendingGR.some((l) => l.expectedDeliveryDate < pd.today) ? 'danger' : 'default'} hint={t('process.kpi.pendingGRHint', { late: kpi.pendingGR.filter((l) => l.expectedDeliveryDate < pd.today).length })} onClick={() => setTab('receiving')} />
        <StatCard label={t('purchasing.kpi.open')} value={kpi.open} icon={ClipboardList} tone="info" hint={t('purchasing.kpi.openHint', { value: formatCurrencyCompact(kpi.openValue) })} onClick={() => setTab('orders')} />
        <StatCard label={t('purchasing.kpi.late')} value={kpi.late} icon={AlertTriangle} tone={kpi.late ? 'danger' : 'default'} hint={t('purchasing.kpi.lateHint')} onClick={() => setTab('orders')} />
        <StatCard label={t('purchasing.kpi.toBuy')} value={kpi.toBuy} icon={ShoppingCart} tone={kpi.toBuy ? 'warning' : 'default'} hint={t('purchasing.kpi.notQuoted', { count: kpi.notQuoted })} onClick={() => setTab('materials')} />
        <StatCard label={t('purchasing.kpi.notReady')} value={kpi.notReady} icon={ClipboardCheck} tone={kpi.notReady ? 'danger' : 'success'} hint={t('purchasing.kpi.notReadyHint')} onClick={() => setTab('readiness')} />
      </div>

      <div className="mb-4 flex gap-1 overflow-x-auto border-b border-slate-200 dark:border-slate-800" role="tablist">
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
            {x === 'requisitions' || x === 'receiving' ? t(`process.tabs.${x}`) : t(`purchasing.tabs.${x}`)}
          </button>
        ))}
      </div>

      {tab === 'requisitions' && <RequisitionsTab openId={reqOpen} onOpenChange={setReqOpen} />}
      {tab === 'orders' && <OrdersTab onOpen={(id) => setDrawer({ id })} />}
      {tab === 'receiving' && <ReceivingTab />}
      {tab === 'materials' && <CatalogTab />}
      {tab === 'readiness' && <ReadinessTab />}
      {tab === 'suppliers' && <SuppliersTab />}

      <PODrawer open={!!drawer} poId={drawer?.id} onClose={() => setDrawer(null)} onRegisterGR={(id) => { setDrawer(null); setGrPo(id); }} />
      <GRDrawer open={!!grPo} poId={grPo} onClose={() => setGrPo(undefined)} />
      <RequisitionWizardDrawer open={wizard} onClose={() => setWizard(false)} onCreated={(id) => { setTab('requisitions'); setReqOpen(id); }} />
      <ExtensionFormDrawer open={extForm} onClose={() => setExtForm(false)} />
    </>
  );
}

function OrdersTab({ onOpen }: { onOpen: (id: string) => void }) {
  const { t } = useI18n();
  const pd = usePurchasingData();
  const [query, setQuery] = useState('');
  const [kind, setKind] = usePersistentState<'all' | POKind>('purchasing.kind', 'all', (v): v is 'all' | POKind => v === 'all' || v === 'sales' || v === 'purchase');
  const [status, setStatus] = useState<'all' | POStatus>('all');
  const [onlyLate, setOnlyLate] = useState(false);

  const rows = pd.purchaseOrders
    .filter((p) => kind === 'all' || p.kind === kind)
    .filter((p) => status === 'all' || p.status === status)
    .filter((p) => !onlyLate || p.lines.some((l) => isLineLate(l, pd.today)))
    .filter((p) => {
      const q = query.trim().toLowerCase();
      return !q || [p.poNumber, p.customerOrVendor, p.requester, ...p.lines.map((l) => `${l.partNumber} ${l.description}`)].some((f) => f.toLowerCase().includes(q));
    })
    .sort((a, b) => b.orderDate.localeCompare(a.orderDate));

  return (
    <div className="card overflow-hidden">
      <div className="flex flex-col gap-3 border-b border-slate-200 p-4 lg:flex-row lg:items-center dark:border-slate-800">
        <div className="relative flex-1">
          <Search className="pointer-events-none absolute top-1/2 left-3 size-4 -translate-y-1/2 text-slate-400" />
          <input className="input pl-9" placeholder={t('purchasing.orders.search')} value={query} onChange={(e) => setQuery(e.target.value)} aria-label={t('common.search')} />
        </div>
        <Select<'all' | POKind> className="lg:w-44" value={kind} onChange={setKind} options={[{ value: 'all', label: t('purchasing.orders.allKinds') }, ...enumOptions(t, 'poKind')]} aria-label={t('purchasing.po.kind')} />
        <Select<'all' | POStatus> className="lg:w-44" value={status} onChange={setStatus} options={[{ value: 'all', label: t('purchasing.orders.allStatuses') }, ...enumOptions(t, 'poStatus')]} aria-label={t('common.status')} />
        <label className="flex cursor-pointer items-center gap-2 text-sm whitespace-nowrap">
          <input type="checkbox" className="size-4 accent-amber-500" checked={onlyLate} onChange={(e) => setOnlyLate(e.target.checked)} />
          {t('purchasing.orders.onlyLate')}
        </label>
      </div>

      {rows.length === 0 ? (
        <EmptyState icon={ClipboardList} title={t('purchasing.orders.empty')} />
      ) : (
        <div className="overflow-x-auto">
          <table className="w-full min-w-[860px]">
            <thead className="bg-slate-50 dark:bg-slate-800/50">
              <tr>
                <th className="th">{t('purchasing.orders.number')}</th>
                <th className="th">{t('purchasing.orders.party')}</th>
                <th className="th">{t('purchasing.orders.orderDate')}</th>
                <th className="th">{t('purchasing.orders.delivery')}</th>
                <th className="th text-right">{t('purchasing.orders.total')}</th>
                <th className="th">{t('common.status')}</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100 dark:divide-slate-800">
              {rows.map((p) => {
                const active = p.lines.filter((l) => l.status !== 'canceled');
                const done = active.filter((l) => l.status === 'delivered').length;
                const late = p.lines.filter((l) => isLineLate(l, pd.today)).length;
                const next = active.filter((l) => l.status !== 'delivered').map((l) => l.expectedDeliveryDate).sort()[0];
                return (
                  <tr key={p.id} onClick={() => onOpen(p.id)} className={cn('cursor-pointer hover:bg-slate-50 dark:hover:bg-slate-800/40', late > 0 && 'bg-red-50/60 dark:bg-red-950/20')}>
                    <td className="td">
                      <p className="font-mono font-semibold text-slate-900 dark:text-white">{p.poNumber}</p>
                      <StatusBadge kind="poKind" value={p.kind} />
                    </td>
                    <td className="td">
                      <p className="font-medium">{p.customerOrVendor}</p>
                      {p.requester && <p className="text-xs text-slate-500">{p.requester}</p>}
                    </td>
                    <td className="td text-sm">{formatDate(p.orderDate)}</td>
                    <td className="td text-xs">
                      <p>{t('purchasing.orders.linesDone', { done, total: active.length })}</p>
                      {next && <p className="text-slate-500">{t('purchasing.orders.nextDelivery', { date: formatDate(next) })}</p>}
                      {late > 0 && (
                        <Badge tone="red" className="mt-1">
                          <AlertTriangle className="size-3" /> {t('purchasing.orders.lateCount', { count: late })}
                        </Badge>
                      )}
                    </td>
                    <td className="td text-right font-semibold tabular-nums">{formatCurrency(poTotal(p))}</td>
                    <td className="td">
                      <StatusBadge kind="poStatus" value={p.status} />
                    </td>
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
