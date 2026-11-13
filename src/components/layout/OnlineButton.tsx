import { useEffect, useRef, useState } from 'react';
import { Users } from 'lucide-react';
import { useCurrentUser } from '@/app/session';
import { StatusBadge } from '@/components/ui/Badge';
import { Avatar } from '@/components/ui/misc';
import { useOnlineUsers } from '@/data/cloud/presence';
import { CLOUD } from '@/data/cloud/runtime';
import type { UserRole } from '@/types/models';
import { useI18n } from '@/i18n';
import { cn } from '@/lib/cn';
import { NAV_FOOTER, NAV_ITEMS } from './nav';

const ROLE_COLOR: Record<string, string> = { master: '#7c3aed', logistics: '#0891b2', office: '#d97706' };
const PAGES = [...NAV_ITEMS, ...NAV_FOOTER];

/** Botão "N online" ao lado do status de sincronização; abre (para cima) a lista de quem está no app. */
export function OnlineButton() {
  const { t } = useI18n();
  const me = useCurrentUser();
  const online = useOnlineUsers();
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    const onDown = (e: MouseEvent) => ref.current && !ref.current.contains(e.target as Node) && setOpen(false);
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && setOpen(false);
    document.addEventListener('mousedown', onDown);
    document.addEventListener('keydown', onKey);
    return () => {
      document.removeEventListener('mousedown', onDown);
      document.removeEventListener('keydown', onKey);
    };
  }, [open]);

  if (!CLOUD) return null;
  // Até a presença sincronizar, conta pelo menos o próprio usuário.
  const list = online.length ? online : me ? [{ userId: me.id, name: me.name, role: me.role, page: '', since: '', sessions: 1 }] : [];
  const pageLabel = (path: string) => {
    const item = PAGES.find((p) => p.path === path);
    return item ? t(item.labelKey) : '';
  };

  return (
    <div ref={ref} className="relative">
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        aria-expanded={open}
        aria-label={t('cloud.online.aria')}
        className={cn('flex items-center gap-1.5 rounded-md px-2 py-1 text-xs font-medium text-slate-300 hover:bg-slate-800 hover:text-white', open && 'bg-slate-800 text-white')}
      >
        <span className="relative flex size-2">
          <span className="absolute inline-flex size-full animate-ping rounded-full bg-green-400 opacity-60" />
          <span className="relative inline-flex size-2 rounded-full bg-green-400" />
        </span>
        <Users className="size-3.5" />
        {t('cloud.online.button', { count: list.length })}
      </button>

      {open && (
        <div className="absolute bottom-full left-0 z-50 mb-2 w-64 rounded-xl border border-slate-700 bg-slate-900 p-2 shadow-2xl" role="dialog" aria-label={t('cloud.online.title')}>
          <p className="px-2 pt-1 pb-2 text-xs font-semibold tracking-wide text-slate-400 uppercase">{t('cloud.online.title')}</p>
          <ul className="max-h-72 space-y-1 overflow-y-auto">
            {list.map((u) => (
              <li key={u.userId} className="flex items-center gap-2.5 rounded-lg px-2 py-1.5">
                <span className="relative">
                  <Avatar name={u.name} color={ROLE_COLOR[u.role] ?? '#64748b'} size="sm" />
                  <span className="absolute -right-0.5 -bottom-0.5 size-2.5 rounded-full bg-green-400 ring-2 ring-slate-900" />
                </span>
                <div className="min-w-0 flex-1">
                  <p className="truncate text-sm font-medium text-white">
                    {u.name}
                    {u.userId === me?.id && <span className="font-normal text-slate-400"> ({t('cloud.online.you')})</span>}
                  </p>
                  <p className="truncate text-xs text-slate-400">
                    {[pageLabel(u.page), u.sessions > 1 ? t('cloud.online.tabs', { count: u.sessions }) : ''].filter(Boolean).join(' · ')}
                  </p>
                </div>
                {['master', 'logistics', 'office'].includes(u.role) && <StatusBadge kind="userRole" value={u.role as UserRole} />}
              </li>
            ))}
          </ul>
          {list.length <= 1 && <p className="px-2 pt-1 pb-1 text-xs text-slate-500">{t('cloud.online.alone')}</p>}
        </div>
      )}
    </div>
  );
}
