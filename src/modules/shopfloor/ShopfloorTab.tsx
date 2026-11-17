import { useMemo, useState } from 'react';
import { Ban, Camera, Check, QrCode, RotateCcw, X } from 'lucide-react';
import { useCan } from '@/app/session';
import { Badge } from '@/components/ui/Badge';
import { Button } from '@/components/ui/Button';
import { Input } from '@/components/ui/Field';
import { Modal } from '@/components/ui/Modal';
import { QrPoster } from '@/components/ui/QrPoster';
import { useToast } from '@/components/ui/Toast';
import { EmptyState } from '@/components/ui/misc';
import { usePersistentState } from '@/lib/usePersistentState';
import { useCollection } from '@/data/hooks';
import { AGING_BUCKETS, agingBucket, shopfloorAge, shopfloorService, type AgingBucket } from '@/domain/shopfloor';
import type { Tone } from '@/domain/labels';
import { useI18n } from '@/i18n';
import { cn } from '@/lib/cn';
import { formatDate } from '@/lib/format';
import type { ShopfloorRequest, ShopfloorRequestStatus } from '@/types/models';

type Filter = 'new' | 'handled' | 'all';
const STATUS_TONE: Record<ShopfloorRequestStatus, Tone> = { new: 'amber', ordered: 'green', rejected: 'red' };
const AGING_TONE: Record<AgingBucket, Tone> = { fresh: 'slate', waiting: 'amber', priority: 'orange', urgent: 'red' };
const AGING_RING: Record<AgingBucket, string> = {
  fresh: 'ring-1 ring-slate-300/70 dark:ring-slate-700',
  waiting: 'ring-1 ring-amber-400/70',
  priority: 'ring-2 ring-orange-500/70',
  urgent: 'ring-2 ring-red-500',
};
const AGING_BAR: Record<AgingBucket, string> = { fresh: 'bg-slate-400', waiting: 'bg-amber-400', priority: 'bg-orange-500', urgent: 'bg-red-600' };

/** Aba "Shop floor" em Ordens de Compra: pedidos feitos pelo QR code (foto + item + fornecedor) para a Logística. */
export function ShopfloorTab() {
  const { t } = useI18n();
  const requests = useCollection('shopfloorRequests');
  const [filter, setFilter] = usePersistentState<Filter>('shopfloor.filter', 'new', (v): v is Filter => v === 'new' || v === 'handled' || v === 'all');
  const [showQr, setShowQr] = useState(false);
  const [zoom, setZoom] = useState<ShopfloorRequest>();

  const list = useMemo(
    () =>
      [...requests]
        .filter((r) => filter === 'all' || (filter === 'new' ? r.status === 'new' : r.status !== 'new'))
        .sort((a, b) => (a.status === 'new') !== (b.status === 'new') ? (a.status === 'new' ? -1 : 1) : a.status === 'new' ? a.createdAt.localeCompare(b.createdAt) : b.createdAt.localeCompare(a.createdAt)),
    [requests, filter],
  );
  const newCount = requests.filter((r) => r.status === 'new').length;
  // Aging: quantos pedidos sem ação em cada faixa (o mais velho é o mais prioritário).
  const aging = useMemo(() => {
    const c: Record<AgingBucket, number> = { fresh: 0, waiting: 0, priority: 0, urgent: 0 };
    for (const r of requests) if (r.status === 'new') c[agingBucket(shopfloorAge(r))]++;
    return c;
  }, [requests]);

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div className="flex rounded-lg bg-slate-100 p-0.5 dark:bg-slate-800" role="group">
          {(['new', 'handled', 'all'] as const).map((f) => (
            <button
              key={f}
              onClick={() => setFilter(f)}
              className={cn('rounded-md px-3 py-1.5 text-sm font-medium', filter === f ? 'bg-white text-slate-900 shadow-sm dark:bg-slate-900 dark:text-white' : 'text-slate-500')}
            >
              {t(`shopfloor.filters.${f}`)}
              {f === 'new' && newCount > 0 && <span className="ml-1.5 rounded-full bg-red-500 px-1.5 text-[11px] font-bold text-white">{newCount}</span>}
            </button>
          ))}
        </div>
        <Button icon={QrCode} onClick={() => setShowQr((v) => !v)}>
          {t('shopfloor.qrButton')}
        </Button>
      </div>

      {newCount > 0 && (
        <div className="grid grid-cols-2 gap-2 sm:grid-cols-4" aria-label={t('shopfloor.aging.title')}>
          {AGING_BUCKETS.map((b) => (
            <div key={b} className={cn('card flex items-center gap-3 p-3', aging[b] > 0 && (b === 'urgent' || b === 'priority') && AGING_RING[b])}>
              <span className={cn('h-10 w-1.5 shrink-0 rounded-full', AGING_BAR[b])} />
              <div className="min-w-0">
                <p className="text-2xl leading-none font-bold tabular-nums">{aging[b]}</p>
                <p className="mt-1 truncate text-xs font-medium text-slate-600 dark:text-slate-300">{t(`shopfloor.aging.${b}`)}</p>
                <p className="truncate text-[11px] text-slate-500">{t(`shopfloor.aging.${b}Range`)}</p>
              </div>
            </div>
          ))}
        </div>
      )}

      {showQr && (
        <QrPoster
          hash="#/shop-request"
          title={t('shopfloor.qrTitle')}
          hint={t('shopfloor.qrHint')}
          posterTitle={t('shopfloor.posterTitle')}
          posterText={t('shopfloor.posterText')}
          fileName="shopfloor-request-qr.png"
          openLabel={t('shopfloor.openPage')}
        />
      )}

      {list.length === 0 ? (
        <EmptyState icon={Camera} title={t('shopfloor.empty')} description={t('shopfloor.emptyHint')} />
      ) : (
        <ul className="grid gap-3 lg:grid-cols-2">
          {list.map((r) => (
            <RequestCard key={r.id} r={r} onZoom={() => setZoom(r)} />
          ))}
        </ul>
      )}

      <Modal open={!!zoom} onClose={() => setZoom(undefined)} title={zoom ? `${zoom.number} · ${zoom.description}` : ''}>
        {zoom && <img src={zoom.photo} alt={zoom.description} className="max-h-[70vh] w-full rounded-lg object-contain" />}
      </Modal>
    </div>
  );
}

function RequestCard({ r, onZoom }: { r: ShopfloorRequest; onZoom: () => void }) {
  const { t } = useI18n();
  const toast = useToast();
  const allowed = useCan();
  const employees = useCollection('employees');
  const users = useCollection('users');
  const [mode, setMode] = useState<'order' | 'reject'>();
  const [text, setText] = useState('');
  const [error, setError] = useState(false);
  const who = employees.find((e) => e.id === r.employeeId)?.name ?? '—';
  const handler = r.handledBy ? (users.find((u) => u.id === r.handledBy)?.name ?? '') : '';
  const canProcess = allowed('requisition.process');
  const age = shopfloorAge(r);
  const bucket = agingBucket(age);

  const confirm = () => {
    if (!text.trim()) return setError(true);
    if (mode === 'order') {
      shopfloorService.markOrdered(r.id, text);
      toast.success(t('shopfloor.toast.ordered', { number: r.number }));
    } else {
      shopfloorService.reject(r.id, text);
      toast.success(t('shopfloor.toast.rejected', { number: r.number }));
    }
    setMode(undefined);
    setText('');
    setError(false);
  };

  return (
    <li className={cn('card flex gap-3 p-3', r.status === 'new' && AGING_RING[bucket])}>
      <button type="button" onClick={onZoom} className="shrink-0" aria-label={t('shopfloor.fields.photo')}>
        <img src={r.photo} alt="" className="size-24 rounded-lg bg-slate-100 object-cover sm:size-28 dark:bg-slate-800" />
      </button>
      <div className="min-w-0 flex-1 space-y-1.5">
        <div className="flex flex-wrap items-center gap-2">
          <span className="font-mono text-xs font-semibold text-slate-500">{r.number}</span>
          <Badge tone={STATUS_TONE[r.status]} dot>
            {t(`shopfloor.status.${r.status}`)}
          </Badge>
          {r.status === 'new' && (
            <Badge tone={AGING_TONE[bucket]}>
              {t(`shopfloor.aging.${bucket}`)} · {t('shopfloor.aging.days', { count: age })}
            </Badge>
          )}
        </div>
        <p className="font-semibold break-words text-slate-900 dark:text-white">
          {r.description} <span className="font-normal text-slate-500 tabular-nums">× {r.quantity}</span>
        </p>
        <dl className="grid grid-cols-[auto_1fr] gap-x-2 gap-y-0.5 text-sm">
          <dt className="text-slate-500">{t('shopfloor.fields.supplier')}</dt>
          <dd className="min-w-0 break-words">{r.supplier}</dd>
          <dt className="text-slate-500">{t('shopfloor.fields.supplierCode')}</dt>
          <dd className="min-w-0 font-mono break-all">{r.supplierCode}</dd>
        </dl>
        <p className="text-xs text-slate-500">{t('shopfloor.requestedBy', { name: who, date: formatDate(r.createdAt.slice(0, 10)) })}</p>
        {r.status !== 'new' && (
          <p className={cn('text-xs font-medium', r.status === 'ordered' ? 'text-green-700 dark:text-green-400' : 'text-red-600')}>
            {t(r.status === 'ordered' ? 'shopfloor.orderedInfo' : 'shopfloor.rejectedInfo', { note: r.note ?? '', name: handler })}
          </p>
        )}

        {canProcess && r.status === 'new' && !mode && (
          <div className="flex flex-wrap gap-2 pt-1">
            <Button size="sm" variant="primary" icon={Check} onClick={() => setMode('order')}>
              {t('shopfloor.markOrdered')}
            </Button>
            <Button size="sm" variant="ghost" icon={Ban} className="text-red-600" onClick={() => setMode('reject')}>
              {t('shopfloor.reject')}
            </Button>
          </div>
        )}
        {canProcess && mode && (
          <div className="flex flex-wrap items-start gap-2 pt-1">
            <div className="min-w-0 flex-1">
              <Input
                autoFocus
                value={text}
                onChange={(e) => {
                  setText(e.target.value);
                  setError(false);
                }}
                onKeyDown={(e) => e.key === 'Enter' && confirm()}
                placeholder={t(mode === 'order' ? 'shopfloor.poNumber' : 'shopfloor.reason')}
                aria-label={t(mode === 'order' ? 'shopfloor.poNumber' : 'shopfloor.reason')}
                className={cn(mode === 'order' && 'font-mono')}
                invalid={error}
              />
            </div>
            <Button size="sm" variant={mode === 'order' ? 'primary' : 'danger'} icon={Check} onClick={confirm}>
              {t('common.confirm')}
            </Button>
            <Button size="sm" variant="ghost" icon={X} onClick={() => { setMode(undefined); setText(''); setError(false); }} aria-label={t('common.cancel')} />
          </div>
        )}
        {canProcess && r.status !== 'new' && (
          <Button size="sm" variant="ghost" icon={RotateCcw} onClick={() => shopfloorService.reopen(r.id)}>
            {t('shopfloor.reopen')}
          </Button>
        )}
      </div>
    </li>
  );
}
