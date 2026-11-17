import { useState } from 'react';
import { FlaskConical } from 'lucide-react';
import { useI18n } from '@/i18n';
import { cn } from '@/lib/cn';
import { getFormatLocale } from '@/lib/format';
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
  if (!open || window.location.hash.startsWith('#/clock') || window.location.hash.startsWith('#/tv') || window.location.hash.startsWith('#/shop') || window.location.hash.startsWith('#/portal')) return null;
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
          <button autoFocus onClick={close} className="rounded-lg bg-neutral-900 px-4 py-2 text-sm font-semibold text-white hover:bg-neutral-700 dark:bg-white dark:text-neutral-900">
            {t('app.disclaimerOk')}
          </button>
        </div>
      </div>
    </div>
  );
}

/**
 * Versão publicada (semver · commit · data/hora do build) + modo de dados/login, fixa no canto inferior direito
 * (celular e desktop) para conferir se o deploy é o do último commit. Não captura cliques.
 */
export function BuildInfo({ className }: { className?: string }) {
  useI18n(); // re-renderiza ao trocar o idioma (formato da data)
  const mode = CLOUD ? (EMAIL_AUTH ? 'cloud · e-mail' : 'cloud · PIN') : 'local';
  const built = new Date(__APP_BUILD_TIME__);
  const when = Number.isNaN(built.getTime())
    ? ''
    : built.toLocaleString(getFormatLocale(), { day: '2-digit', month: '2-digit', year: '2-digit', hour: '2-digit', minute: '2-digit' });
  return (
    <p
      className={cn(
        'pointer-events-none fixed right-2 z-20 rounded-md bg-white/80 px-1.5 py-0.5 font-mono text-[10px] leading-tight text-slate-500 shadow-sm ring-1 ring-slate-200 backdrop-blur select-none sm:right-3 sm:text-[11px] dark:bg-slate-900/80 dark:text-slate-400 dark:ring-slate-700',
        className,
      )}
      style={{ bottom: 'max(0.5rem, env(safe-area-inset-bottom))' }}
      title={`v${__APP_SEMVER__} · ${__APP_VERSION__} · ${__APP_BUILD_TIME__} · ${mode}`}
    >
      v{__APP_SEMVER__} · {__APP_VERSION__}
      {when && <> · {when}</>}
      <span className="hidden sm:inline"> · {mode}</span>
    </p>
  );
}
