import { Database, RotateCcw, Upload } from 'lucide-react';
import { navigate } from '@/app/router';
import { useCan, useCurrentUser } from '@/app/session';
import { Button } from '@/components/ui/Button';
import { useToast } from '@/components/ui/Toast';
import { CLOUD, db } from '@/data/db';
import { useCollection } from '@/data/hooks';
import { useI18n } from '@/i18n';

/** Primeiro acesso à nuvem com a base vazia: orienta o Master a importar um backup ou carregar a demo. */
export function EmptyCloudBanner() {
  const { t } = useI18n();
  const toast = useToast();
  const allowed = useCan();
  const me = useCurrentUser();
  // Assina coleções principais para reagir quando os dados chegarem.
  useCollection('employees');
  useCollection('projects');
  useCollection('purchaseOrders');
  if (!CLOUD || !allowed('data.manage') || !db.isEmpty()) return null;

  return (
    <div className="mb-6 flex flex-col gap-3 rounded-xl border border-brand-500/50 bg-brand-50 p-4 sm:flex-row sm:items-center dark:bg-brand-500/10">
      <Database className="size-6 shrink-0 text-brand-600" />
      <div className="flex-1">
        <p className="font-semibold text-slate-900 dark:text-white">{t('cloud.emptyTitle')}</p>
        <p className="text-sm text-slate-600 dark:text-slate-300">{t('cloud.emptyText')}</p>
      </div>
      <div className="flex gap-2">
        <Button icon={Upload} onClick={() => navigate('/settings')}>
          {t('cloud.goRestore')}
        </Button>
        <Button
          variant="primary"
          icon={RotateCcw}
          onClick={() => {
            db.resetToDemo(me?.id);
            toast.success(t('cloud.demoLoaded'));
          }}
        >
          {t('cloud.loadDemo')}
        </Button>
      </div>
    </div>
  );
}
