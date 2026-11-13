import { CloudOff } from 'lucide-react';
import { CLOUD } from '@/data/db';
import { useI18n } from '@/i18n';

/** Publicado (fora do localhost/visualizador) sem Supabase: avisa que os dados não são compartilhados. */
export function LocalModeBanner() {
  const { t } = useI18n();
  if (CLOUD || typeof location === 'undefined') return null;
  const { hostname, protocol } = location;
  const hosted = protocol.startsWith('http') && !['localhost', '127.0.0.1', ''].includes(hostname) && !hostname.endsWith('claude.ai') && !hostname.endsWith('claudeusercontent.com');
  if (!hosted) return null;
  return (
    <div role="alert" className="mb-6 flex gap-3 rounded-xl border border-amber-400/60 bg-amber-50 p-4 dark:bg-amber-500/10">
      <CloudOff className="size-6 shrink-0 text-amber-600" />
      <div>
        <p className="font-semibold text-slate-900 dark:text-white">{t('cloud.localTitle')}</p>
        <p className="text-sm text-slate-600 dark:text-slate-300">{t('cloud.localText')}</p>
      </div>
    </div>
  );
}
