import { useState, type ReactNode } from 'react';
import { Cog, Languages, LogOut, Menu, Moon, Sun, X } from 'lucide-react';
import { logout, useCurrentUser } from '@/app/session';
import { enumLabel } from '@/domain/labels';
import { usePendingCounts, usePendingExtensions } from './usePendingCounts';
import { SyncIndicator } from './SyncIndicator';
import { EmptyCloudBanner } from './EmptyCloudBanner';
import { LocalModeBanner } from './LocalModeBanner';
import { DisclaimerStrip } from './Disclaimer';
import { navigate, useRoute } from '@/app/router';
import { useTheme } from '@/app/theme';
import { LOCALES, useI18n } from '@/i18n';
import { APP_CONFIG } from '@/lib/config';
import { cn } from '@/lib/cn';
import { NAV_FOOTER, NAV_ITEMS, type NavItem } from './nav';

function Brand() {
  const { t } = useI18n();
  return (
    <div className="flex items-center gap-3">
      <div className="flex size-9 items-center justify-center rounded-lg bg-brand-500 text-slate-950 shadow-inner">
        <Cog className="size-5" strokeWidth={2.5} />
      </div>
      <div className="leading-tight">
        <p className="text-base font-bold tracking-tight text-white">{APP_CONFIG.appName}</p>
        <p className="text-[11px] text-slate-400">{t('app.tagline')}</p>
      </div>
    </div>
  );
}

function NavLink({ item, active, onNavigate, badge }: { item: NavItem; active: boolean; onNavigate: () => void; badge?: number }) {
  const { t } = useI18n();
  const Icon = item.icon;
  return (
    <a
      href={`#${item.path}`}
      onClick={(e) => {
        e.preventDefault();
        navigate(item.path);
        onNavigate();
      }}
      aria-current={active ? 'page' : undefined}
      className={cn(
        'group flex items-center gap-3 rounded-lg px-3 py-2 text-sm font-medium transition-colors',
        active ? 'bg-slate-800 text-white' : 'text-slate-400 hover:bg-slate-800/60 hover:text-slate-100',
      )}
    >
      <Icon className={cn('size-[18px] shrink-0', active ? 'text-brand-400' : 'text-slate-500 group-hover:text-slate-300')} />
      <span className="truncate">{t(item.labelKey)}</span>
      {badge ? <span className="ml-auto rounded-full bg-red-500 px-1.5 text-[11px] font-bold text-white tabular-nums">{badge}</span> : null}
      {active && <span className={cn('h-5 w-1 rounded-full bg-brand-500', !badge && 'ml-auto')} />}
    </a>
  );
}

function LanguageSwitcher() {
  const { locale, setLocale, t } = useI18n();
  return (
    <div className="px-3 py-2">
      <p className="mb-1.5 flex items-center gap-2 text-[11px] font-semibold tracking-wider text-slate-500 uppercase">
        <Languages className="size-3.5" /> {t('app.language')}
      </p>
      <div className="grid grid-cols-3 gap-1 rounded-lg bg-slate-800/60 p-1" role="radiogroup" aria-label={t('app.language')}>
        {LOCALES.map((l) => (
          <button
            key={l.value}
            role="radio"
            aria-checked={locale === l.value}
            title={l.label}
            onClick={() => setLocale(l.value)}
            className={cn(
              'flex items-center justify-center gap-1 rounded-md py-1 text-xs font-semibold transition-colors',
              locale === l.value ? 'bg-slate-700 text-white shadow' : 'text-slate-400 hover:text-slate-100',
            )}
          >
            <span aria-hidden>{l.flag}</span>
            {l.short}
          </button>
        ))}
      </div>
    </div>
  );
}

function SidebarContent({ onNavigate }: { onNavigate: () => void }) {
  const { path } = useRoute();
  const { theme, toggle } = useTheme();
  const { t } = useI18n();
  const user = useCurrentUser();
  const pending = usePendingCounts();
  const pendingExt = usePendingExtensions();
  return (
    <div className="flex h-full flex-col">
      <div className="px-4 py-5">
        <Brand />
      </div>
      <nav className="flex-1 space-y-1 overflow-y-auto px-3" aria-label="Main">
        <p className="px-3 pb-2 text-[11px] font-semibold tracking-wider text-slate-500 uppercase">{t('app.sectionOperation')}</p>
        {NAV_ITEMS.map((item) => (
          <NavLink key={item.path} item={item} active={path === item.path} onNavigate={onNavigate} badge={item.path === '/purchase-orders' ? pending : item.path === '/extensions' ? pendingExt : undefined} />
        ))}
      </nav>
      <div className="space-y-1 border-t border-slate-800 px-3 py-3">
        {NAV_FOOTER.map((item) => (
          <NavLink key={item.path} item={item} active={path === item.path} onNavigate={onNavigate} />
        ))}
        <button
          onClick={toggle}
          className="flex w-full items-center gap-3 rounded-lg px-3 py-2 text-sm font-medium text-slate-400 transition-colors hover:bg-slate-800/60 hover:text-slate-100"
        >
          {theme === 'dark' ? <Sun className="size-[18px]" /> : <Moon className="size-[18px]" />}
          {theme === 'dark' ? t('app.themeLight') : t('app.themeDark')}
        </button>
        <LanguageSwitcher />
        <SyncIndicator />
        {user && (
          <div className="mt-2 flex items-center gap-2 rounded-lg bg-slate-800/60 px-3 py-2">
            <div className="min-w-0 flex-1">
              <p className="text-[10px] tracking-wider text-slate-500 uppercase">{t('auth.loggedAs')}</p>
              <p className="truncate text-sm font-medium text-white">{user.name}</p>
              <p className="text-[11px] text-brand-400">{enumLabel(t, 'userRole', user.role)}</p>
            </div>
            <button onClick={logout} className="rounded-md p-1.5 text-slate-400 hover:bg-slate-700 hover:text-white" title={t('auth.logout')} aria-label={t('auth.logout')}>
              <LogOut className="size-4" />
            </button>
          </div>
        )}
      </div>
    </div>
  );
}

export function Layout({ children }: { children: ReactNode }) {
  const [mobileOpen, setMobileOpen] = useState(false);
  const { t } = useI18n();
  const close = () => setMobileOpen(false);

  return (
    <div className="min-h-screen">
      <aside className="fixed inset-y-0 left-0 z-30 hidden w-64 border-r border-slate-800 bg-slate-900 lg:block dark:bg-slate-950">
        <SidebarContent onNavigate={close} />
      </aside>

      <header className="sticky top-0 z-30 flex h-14 items-center justify-between border-b border-slate-800 bg-slate-900 px-4 lg:hidden">
        <Brand />
        <button onClick={() => setMobileOpen(true)} className="rounded-lg p-2 text-slate-300 hover:bg-slate-800" aria-label={t('common.openMenu')}>
          <Menu className="size-5" />
        </button>
      </header>

      {mobileOpen && (
        <div className="fixed inset-0 z-40 lg:hidden">
          <div className="animate-fade-in absolute inset-0 bg-slate-950/60" onClick={close} />
          <aside className="animate-slide-in-left absolute inset-y-0 left-0 w-72 bg-slate-900 shadow-2xl">
            <button onClick={close} className="absolute top-4 right-3 rounded-lg p-1.5 text-slate-400 hover:bg-slate-800" aria-label={t('common.closeMenu')}>
              <X className="size-5" />
            </button>
            <SidebarContent onNavigate={close} />
          </aside>
        </div>
      )}

      <main className="lg:pl-64">
        <DisclaimerStrip />
        <div className="mx-auto max-w-[1600px] px-4 py-6 sm:px-6 lg:px-8">
          <LocalModeBanner />
          <EmptyCloudBanner />
          {children}
        </div>
      </main>
    </div>
  );
}
