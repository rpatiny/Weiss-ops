import { useMemo, useState } from 'react';
import { Globe2, Loader } from 'lucide-react';
import { navigate } from '@/app/router';
import { useCan } from '@/app/session';
import { useCollection } from '@/data/hooks';
import { plantState } from '@/domain/extensions';
import { normPN } from '@/domain/purchasing';
import { useI18n } from '@/i18n';
import { HOME_PLANT } from '@/lib/config';
import { ExtensionFormDrawer, type ExtensionPrefill } from './ExtensionFormDrawer';

/**
 * Selo de extensão SAP de um material para a planta de compra.
 * Não estendido → vermelho + botão "Pedir extensão"; pedido em aberto → índigo, leva à tela de extensões.
 */
export function PlantBadge({ partNumber, prefill }: { partNumber: string; prefill?: ExtensionPrefill }) {
  const { t } = useI18n();
  const allowed = useCan();
  const catalog = useCollection('materials');
  const extensions = useCollection('extensions');
  const [open, setOpen] = useState(false);
  const catByPN = useMemo(() => new Map(catalog.map((c) => [normPN(c.partNumber), c])), [catalog]);
  const { state, request } = plantState(partNumber, catByPN, extensions);

  if (state === 'ok' || state === 'unknown') return null;
  if (state === 'pending' && request)
    return (
      <button
        type="button"
        onClick={(e) => {
          e.stopPropagation();
          navigate('/extensions', { open: request.id });
        }}
        className="inline-flex items-center gap-1 rounded-md bg-indigo-50 px-2 py-0.5 text-xs font-medium text-indigo-700 ring-1 ring-indigo-600/20 ring-inset hover:bg-indigo-100 dark:bg-indigo-500/10 dark:text-indigo-300"
      >
        <Loader className="size-3" /> {t('extensions.badge.pending', { number: request.number })}
      </button>
    );
  return (
    <span className="inline-flex flex-wrap items-center gap-1">
      <span className="inline-flex items-center gap-1 rounded-md bg-red-50 px-2 py-0.5 text-xs font-medium text-red-700 ring-1 ring-red-600/20 ring-inset dark:bg-red-500/10 dark:text-red-300">
        <Globe2 className="size-3" /> {t('extensions.badge.missing', { plant: HOME_PLANT })}
      </span>
      {allowed('extension.request') && (
        <button
          type="button"
          onClick={(e) => {
            e.stopPropagation();
            setOpen(true);
          }}
          className="rounded-md bg-indigo-600 px-2 py-0.5 text-xs font-semibold text-white hover:bg-indigo-500"
        >
          {t('extensions.badge.request')}
        </button>
      )}
      <ExtensionFormDrawer open={open} prefill={{ partNumber, ...prefill }} onClose={() => setOpen(false)} />
    </span>
  );
}
