import { useSyncExternalStore } from 'react';
import { Cloud, CloudOff, Loader2, TriangleAlert } from 'lucide-react';
import { getRealtimeConnected, onRealtimeStatus } from '@/data/cloud/connect';
import { CLOUD, syncQueue } from '@/data/cloud/runtime';
import { useI18n } from '@/i18n';
import { cn } from '@/lib/cn';

/** Status da sincronização com a nuvem (só aparece no modo nuvem). */
export function SyncIndicator() {
  const { t } = useI18n();
  const state = useSyncExternalStore(
    (cb) => syncQueue.subscribe(cb),
    () => syncQueue.state,
    () => syncQueue.state,
  );
  // useSyncExternalStore relê o valor ao assinar: não perde uma conexão aberta entre o render e o efeito.
  const live = useSyncExternalStore((cb) => onRealtimeStatus(() => cb()), getRealtimeConnected, getRealtimeConnected);
  if (!CLOUD) return null;

  const [Icon, label, cls] =
    state === 'saving'
      ? [Loader2, t('cloud.sync.saving'), 'text-blue-300']
      : state === 'offline'
        ? [CloudOff, t('cloud.sync.offline'), 'text-amber-300']
        : state === 'error'
          ? [TriangleAlert, t('cloud.sync.error'), 'text-red-300']
          : !live
            ? [Loader2, t('cloud.sync.notLive'), 'text-slate-400']
            : [Cloud, t('cloud.sync.synced'), 'text-green-300'];

  return (
    <p className={cn('flex items-center gap-2 px-3 py-1.5 text-xs', cls)} role="status" title={state === 'error' ? syncQueue.lastError : undefined}>
      <Icon className={cn('size-3.5', (state === 'saving' || (!live && state === 'synced')) && 'animate-spin')} />
      {label}
    </p>
  );
}
