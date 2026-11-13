/**
 * Quem está online: cada aba logada anuncia (usuário, perfil, página) pelo canal de presença
 * do Supabase Realtime. A lista é agrupada por usuário (várias abas = 1 pessoa, com contagem).
 */
import { useSyncExternalStore } from 'react';
import type { PresenceInfo } from './backend';
import { CLOUD, getCloudBackend } from './runtime';

export interface OnlineUser {
  userId: string;
  name: string;
  role: string;
  /** Página da aba mais recente. */
  page: string;
  since: string;
  /** Abas/dispositivos abertos com este usuário. */
  sessions: number;
}

let online: OnlineUser[] = [];
const listeners = new Set<() => void>();
let handle: { update(me: PresenceInfo): void; stop(): void } | null = null;
let handleUser = '';

function group(entries: PresenceInfo[]): OnlineUser[] {
  const map = new Map<string, OnlineUser>();
  for (const e of entries) {
    const cur = map.get(e.userId);
    if (!cur) map.set(e.userId, { ...e, sessions: 1 });
    else map.set(e.userId, { ...cur, sessions: cur.sessions + 1, ...(e.since > cur.since ? { page: e.page } : {}), since: e.since < cur.since ? e.since : cur.since });
  }
  return [...map.values()].sort((a, b) => a.name.localeCompare(b.name));
}

function set(entries: PresenceInfo[]) {
  online = group(entries);
  listeners.forEach((l) => l());
}

/** Inicia/atualiza o anúncio desta aba. Trocar de usuário reinicia o canal. */
export function announcePresence(me: Omit<PresenceInfo, 'since'> | null): void {
  if (!CLOUD) return;
  if (!me) {
    handle?.stop();
    handle = null;
    handleUser = '';
    set([]);
    return;
  }
  if (handle && handleUser === me.userId) {
    handle.update({ ...me, since: startedAt });
    return;
  }
  handle?.stop();
  handleUser = me.userId;
  void getCloudBackend().then((b) => {
    if (handleUser !== me.userId) return;
    handle = b.presence({ ...me, since: startedAt }, set);
  });
}
const startedAt = new Date().toISOString();

export function useOnlineUsers(): OnlineUser[] {
  return useSyncExternalStore(
    (cb) => {
      listeners.add(cb);
      return () => listeners.delete(cb);
    },
    () => online,
    () => online,
  );
}
