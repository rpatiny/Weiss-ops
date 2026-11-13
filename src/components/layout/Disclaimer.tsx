import { useState } from 'react';
import { FlaskConical } from 'lucide-react';
import { useI18n } from '@/i18n';
import { cn } from '@/lib/cn';
import { CLOUD, EMAIL_AUTH } from '@/data/cloud/runtime';

const SEEN_KEY = 'spindleops:disclaimer-seen';

/** Faixa fixa: lembra em todas as telas que os dados são fictícios. */
export function DisclaimerStrip({ className }: { className?: string }) {
  const { t } = useI18n();
  return (
    <p role="note" className={cn('flex items-center justify-center gap-2 bg-amber-400 px-4 py-1.5 text-center text-xs font-semibold text-amber-950', className)}>
      <FlaskConical className="size-3.5 shrink-0" aria-hidden />
      {t('app.disclaimerShort')}
    </p>
  );
}

/** Aviso ao abrir o aplicativo (uma vez por sessão do navegador). */
export function StartupDisclaimer() {
  const { t } = useI18n();
  const [open, setOpen] = useState(() => {
    try {
      return sessionStorage.getItem(SEEN_KEY) !== '1';
    } catch {
      return true;
    }
  });
  // No ponto da oficina (QR code) o aviso fica só na faixa: o técnico abre a tela várias vezes por dia.
  if (!open || window.location.hash.startsWith('#/clock')) return null;
  const close = () => {
    try {
      sessionStorage.setItem(SEEN_KEY, '1');
    } catch {
      /* armazenamento indisponível: o aviso volta na próxima abertura */
    }
    setOpen(false);
  };
  return (
    <div className="fixed inset-0 z-[100] flex items-center justify-center bg-slate-950/70 p-4" role="dialog" aria-modal="true" aria-labelledby="disclaimer-title">
      <div className="card w-full max-w-md p-6 shadow-2xl">
        <div className="mb-3 flex items-center gap-3">
          <div className="flex size-10 shrink-0 items-center justify-center rounded-xl bg-amber-100 text-amber-700 dark:bg-amber-500/15 dark:text-amber-400">
            <FlaskConical className="size-5" />
          </div>
          <h2 id="disclaimer-title" className="text-lg font-semibold text-slate-900 dark:text-white">{t('app.disclaimerTitle')}</h2>
        </div>
        <p className="text-sm text-slate-600 dark:text-slate-300">{t('app.disclaimerText')}</p>
        <div className="mt-6 flex justify-end">
          <button autoFocus onClick={close} className="rounded-lg bg-brand-500 px-4 py-2 text-sm font-semibold text-slate-950 hover:bg-brand-400">
            {t('app.disclaimerOk')}
          </button>
        </div>
      </div>
    </div>
  );
}

/** Versão publicada + modo de dados/login (para conferir o deploy). */
export function BuildInfo({ className }: { className?: string }) {
  const mode = CLOUD ? (EMAIL_AUTH ? 'cloud · e-mail' : 'cloud · PIN') : 'local';
  return <p className={cn('text-center text-[11px] text-slate-500', className)}>v{__APP_VERSION__} · {mode}</p>;
}
