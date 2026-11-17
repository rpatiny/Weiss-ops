import { Camera, ChevronRight, Timer } from 'lucide-react';
import { BrandLogo } from '@/components/layout/BrandLogo';
import { DisclaimerStrip } from '@/components/layout/Disclaimer';
import { LOCALES, useI18n } from '@/i18n';
import { cn } from '@/lib/cn';

/**
 * QR único do chão de fábrica (`#/shop`): um cartaz só, que abre este menu —
 * "Marcar minhas horas" (ponto) ou "Pedir material" (pedido de compra com foto). Os dois usam o PIN do ponto.
 */
export function ShopHubPage() {
  const { t, locale, setLocale } = useI18n();
  const items = [
    { href: '#/clock', icon: Timer, title: t('shopHub.clock'), text: t('shopHub.clockText'), tone: 'bg-green-600' },
    { href: '#/shop-request', icon: Camera, title: t('shopHub.request'), text: t('shopHub.requestText'), tone: 'bg-neutral-900 dark:bg-white dark:text-neutral-900' },
  ];
  return (
    <div className="flex min-h-dvh flex-col bg-slate-100 dark:bg-slate-950">
      <DisclaimerStrip />
      <header className="flex items-center justify-between gap-3 bg-slate-900 px-4 py-3 text-white">
        <div className="flex items-center gap-2.5">
          <BrandLogo className="w-20" />
          <p className="border-l border-slate-700 pl-2.5 font-bold leading-tight">{t('shopHub.title')}</p>
        </div>
        <div className="flex gap-0.5">
          {LOCALES.map((l) => (
            <button key={l.value} onClick={() => setLocale(l.value)} className={cn('rounded-md px-2 py-1 text-xs font-semibold', locale === l.value ? 'bg-slate-700 text-white' : 'text-slate-400')}>
              {l.short}
            </button>
          ))}
        </div>
      </header>
      <main className="mx-auto w-full max-w-md flex-1 space-y-3 px-4 py-6">
        <h1 className="text-xl font-bold text-slate-900 dark:text-white">{t('shopHub.question')}</h1>
        {items.map(({ href, icon: Icon, title, text, tone }) => (
          <a key={href} href={href} className="card flex items-center gap-4 p-5 active:scale-[0.99]">
            <span className={cn('flex size-14 shrink-0 items-center justify-center rounded-2xl text-white', tone)}>
              <Icon className="size-7" />
            </span>
            <span className="min-w-0 flex-1">
              <span className="block text-lg font-bold text-slate-900 dark:text-white">{title}</span>
              <span className="block text-sm text-slate-500">{text}</span>
            </span>
            <ChevronRight className="size-6 shrink-0 text-slate-400" />
          </a>
        ))}
        <p className="pt-2 text-center text-xs text-slate-500">{t('shopHub.pinHint')}</p>
      </main>
    </div>
  );
}
