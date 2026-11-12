import { useState, type ReactNode } from 'react';
import { Cog, Menu, Moon, Sun, X } from 'lucide-react';
import { navigate, useRoute } from '@/app/router';
import { useTheme } from '@/app/theme';
import { APP_CONFIG } from '@/lib/config';
import { cn } from '@/lib/cn';
import { NAV_FOOTER, NAV_ITEMS, type NavItem } from './nav';

function Brand() {
  return (
    <div className="flex items-center gap-3">
      <div className="flex size-9 items-center justify-center rounded-lg bg-brand-500 text-slate-950 shadow-inner">
        <Cog className="size-5" strokeWidth={2.5} />
      </div>
      <div className="leading-tight">
        <p className="text-base font-bold tracking-tight text-white">{APP_CONFIG.appName}</p>
        <p className="text-[11px] text-slate-400">{APP_CONFIG.companyTagline}</p>
      </div>
    </div>
  );
}

function NavLink({ item, active, onNavigate }: { item: NavItem; active: boolean; onNavigate: () => void }) {
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
      <span className="truncate">{item.label}</span>
      {active && <span className="ml-auto h-5 w-1 rounded-full bg-brand-500" />}
    </a>
  );
}

function SidebarContent({ onNavigate }: { onNavigate: () => void }) {
  const { path } = useRoute();
  const { theme, toggle } = useTheme();
  return (
    <div className="flex h-full flex-col">
      <div className="px-4 py-5">
        <Brand />
      </div>
      <nav className="flex-1 space-y-1 px-3" aria-label="Principal">
        <p className="px-3 pb-2 text-[11px] font-semibold tracking-wider text-slate-500 uppercase">Operação</p>
        {NAV_ITEMS.map((item) => (
          <NavLink key={item.path} item={item} active={path === item.path} onNavigate={onNavigate} />
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
          {theme === 'dark' ? 'Tema claro' : 'Tema escuro'}
        </button>
      </div>
    </div>
  );
}

export function Layout({ children }: { children: ReactNode }) {
  const [mobileOpen, setMobileOpen] = useState(false);
  const close = () => setMobileOpen(false);

  return (
    <div className="min-h-screen">
      {/* Sidebar fixa (desktop) */}
      <aside className="fixed inset-y-0 left-0 z-30 hidden w-64 border-r border-slate-800 bg-slate-900 lg:block dark:bg-slate-950">
        <SidebarContent onNavigate={close} />
      </aside>

      {/* Topbar (mobile) */}
      <header className="sticky top-0 z-30 flex h-14 items-center justify-between border-b border-slate-800 bg-slate-900 px-4 lg:hidden">
        <Brand />
        <button onClick={() => setMobileOpen(true)} className="rounded-lg p-2 text-slate-300 hover:bg-slate-800" aria-label="Abrir menu">
          <Menu className="size-5" />
        </button>
      </header>

      {/* Sidebar (mobile, off-canvas) */}
      {mobileOpen && (
        <div className="fixed inset-0 z-40 lg:hidden">
          <div className="animate-fade-in absolute inset-0 bg-slate-950/60" onClick={close} />
          <aside className="animate-slide-in-left absolute inset-y-0 left-0 w-72 bg-slate-900 shadow-2xl">
            <button onClick={close} className="absolute top-4 right-3 rounded-lg p-1.5 text-slate-400 hover:bg-slate-800" aria-label="Fechar menu">
              <X className="size-5" />
            </button>
            <SidebarContent onNavigate={close} />
          </aside>
        </div>
      )}

      <main className="lg:pl-64">
        <div className="mx-auto max-w-[1600px] px-4 py-6 sm:px-6 lg:px-8">{children}</div>
      </main>
    </div>
  );
}
