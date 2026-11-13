import { useState } from 'react';
import { Boxes, FileInput, Globe2, UserCog, CalendarRange, ClipboardList, Cog, Truck, Database, FolderKanban, Palmtree, RotateCcw, Trash2, TrendingUp, Users, type LucideIcon } from 'lucide-react';
import { Button } from '@/components/ui/Button';
import { ConfirmDialog } from '@/components/ui/Modal';
import { PageHeader } from '@/components/ui/misc';
import { useToast } from '@/components/ui/Toast';
import { CLOUD, db } from '@/data/db';
import { useCurrentUser } from '@/app/session';
import { useCollection } from '@/data/hooks';
import { useI18n } from '@/i18n';
import { useCan } from '@/app/session';
import { UsersSection } from './UsersSection';
import { DataIOSection } from './DataIOSection';
import { getFormatLocale } from '@/lib/format';
import type { CollectionName } from '@/types/models';

const COLLECTION_ICONS: Record<CollectionName, LucideIcon> = {
  users: UserCog,
  requisitions: FileInput,
  extensions: Globe2,
  employees: Users,
  projects: FolderKanban,
  assignments: CalendarRange,
  absences: Palmtree,
  purchaseOrders: ClipboardList,
  suppliers: Truck,
  materials: Boxes,
  spindles: Cog,
  forecast: TrendingUp,
};

function CollectionCount({ name }: { name: CollectionName }) {
  const items = useCollection(name);
  const { t } = useI18n();
  const Icon = COLLECTION_ICONS[name];
  return (
    <div className="flex items-center gap-3 rounded-lg border border-slate-200 p-3 dark:border-slate-800">
      <Icon className="size-5 text-slate-400" />
      <span className="flex-1 text-sm">{t(`settings.collections.${name}`)}</span>
      <span className="font-semibold tabular-nums">{items.length}</span>
    </div>
  );
}

export function SettingsPage() {
  const toast = useToast();
  const { t } = useI18n();
  const [confirm, setConfirm] = useState<'reset' | 'clear' | null>(null);
  const allowed = useCan();
  const me = useCurrentUser();
  // Re-renderiza após reset/limpeza (meta muda junto com as coleções).
  useCollection('employees');
  const meta = db.getMeta();

  const run = () => {
    if (confirm === 'reset') {
      db.resetToDemo(me?.id);
      toast.success(t('settings.toastReset'));
    } else if (confirm === 'clear') {
      db.clearAll();
      toast.success(t('settings.toastCleared'));
    }
    setConfirm(null);
  };

  return (
    <>
      <PageHeader icon={Database} title={t('settings.title')} description={CLOUD ? t('cloud.mode') : t('settings.description')} />

      <div className="grid gap-6 lg:grid-cols-2">
        <section className="card p-5">
          <h2 className="mb-1 font-semibold text-slate-900 dark:text-white">{t('settings.storedTitle')}</h2>
          <p className="mb-4 text-sm text-slate-500">
            {t('settings.source')}: <strong>{t(`settings.sources.${meta?.source ?? 'empty'}`)}</strong>
            {meta && <> · {t('settings.initializedAt', { date: new Date(meta.initializedAt).toLocaleString(getFormatLocale()) })}</>}
          </p>
          <div className="grid gap-2 sm:grid-cols-2">
            {(Object.keys(COLLECTION_ICONS) as CollectionName[]).map((n) => (
              <CollectionCount key={n} name={n} />
            ))}
          </div>
        </section>

        {allowed('data.manage') && (
        <section className="card p-5">
          <h2 className="mb-1 font-semibold text-slate-900 dark:text-white">{t('settings.maintenanceTitle')}</h2>
          <p className="mb-4 text-sm text-slate-500">{t('settings.maintenanceHint')}</p>
          <div className="space-y-3">
            <div className="flex items-center justify-between gap-4 rounded-lg border border-slate-200 p-3 dark:border-slate-800">
              <div>
                <p className="text-sm font-medium">{t('settings.resetTitle')}</p>
                <p className="text-xs text-slate-500">{t('settings.resetHint')}</p>
              </div>
              <Button icon={RotateCcw} onClick={() => setConfirm('reset')}>
                {t('settings.resetButton')}
              </Button>
            </div>
            <div className="flex items-center justify-between gap-4 rounded-lg border border-red-200 bg-red-50/50 p-3 dark:border-red-900/50 dark:bg-red-950/20">
              <div>
                <p className="text-sm font-medium text-red-700 dark:text-red-400">{t('settings.clearTitle')}</p>
                <p className="text-xs text-slate-500">{t('settings.clearHint')}</p>
              </div>
              <Button variant="danger" icon={Trash2} onClick={() => setConfirm('clear')}>
                {t('settings.clearButton')}
              </Button>
            </div>
          </div>
        </section>
        )}
        <DataIOSection />
        {allowed('users.manage') && <UsersSection />}
      </div>

      <ConfirmDialog
        open={confirm !== null}
        title={confirm === 'reset' ? t('settings.confirmResetTitle') : t('settings.confirmClearTitle')}
        message={t('settings.confirmMessage')}
        confirmLabel={confirm === 'reset' ? t('settings.confirmReset') : t('settings.confirmClear')}
        onConfirm={run}
        onCancel={() => setConfirm(null)}
      />
    </>
  );
}
