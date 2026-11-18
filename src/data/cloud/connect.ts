import { metaRepo, profilesRepo, repos, DATA_COLLECTIONS } from '../db';
import type { RemoteRepository } from './remoteRepository';
import type { Entity } from '../repository';
import { EMAIL_AUTH, getCloudBackend, syncQueue } from './runtime';

type Remote = RemoteRepository<Entity>;
const remoteFor = (collection: string): Remote | undefined =>
  collection === '_meta'
    ? (metaRepo as unknown as Remote)
    : collection === 'users' && !EMAIL_AUTH
      ? (repos.users as unknown as Remote)
      : (DATA_COLLECTIONS as readonly string[]).includes(collection)
        ? (repos[collection as (typeof DATA_COLLECTIONS)[number]] as unknown as Remote)
        : undefined;

let unsubscribe: (() => void) | null = null;
const connectionListeners = new Set<(connected: boolean) => void>();
export let realtimeConnected = false;

export const getRealtimeConnected = () => realtimeConnected;

export function onRealtimeStatus(cb: (connected: boolean) => void): () => void {
  connectionListeners.add(cb);
  return () => connectionListeners.delete(cb);
}

/** Carrega todos os dados da nuvem e passa a receber as alterações dos outros usuários em tempo real. */
async function loadAll(): Promise<void> {
  const b = await getCloudBackend();
  const [profiles, rows] = await Promise.all([EMAIL_AUTH ? b.fetchProfiles() : Promise.resolve([]), b.fetchAll()]);
  profilesRepo?.hydrate(profiles);
  const grouped = new Map<string, Entity[]>();
  for (const r of rows) grouped.set(r.collection, [...(grouped.get(r.collection) ?? []), { ...(r.data as Entity), id: r.id }]);
  // O que este aparelho gravou e ainda não chegou ao servidor continua valendo (e continua na fila).
  const local = new Map(syncQueue.pendingChanges().map((p) => [p.collection, p]));
  for (const c of [...DATA_COLLECTIONS, '_meta', ...(EMAIL_AUTH ? [] : ['users'])]) remoteFor(c)?.hydrate(grouped.get(c) ?? [], local.get(c) ?? { upserts: [], deletes: [] });
}

let resyncing: Promise<void> | null = null;
let hiddenAt = 0;
let listening = false;
/**
 * Recarrega tudo da nuvem. O tempo real não entrega o que aconteceu enquanto a conexão estava caída
 * (celular bloqueado, aba em segundo plano, Wi-Fi da oficina): sem isso, horas registradas nesse intervalo
 * só apareciam ao recarregar a página.
 */
export function resyncCloud(): Promise<void> {
  if (!unsubscribe) return Promise.resolve();
  resyncing ??= loadAll()
    .catch(() => undefined)
    .finally(() => {
      resyncing = null;
    });
  return resyncing;
}

export async function connectCloud(): Promise<void> {
  const b = await getCloudBackend();
  await loadAll();
  syncQueue.resume();

  if (!listening && typeof window !== 'undefined') {
    listening = true;
    document.addEventListener('visibilitychange', () => {
      if (document.visibilityState === 'hidden') hiddenAt = Date.now();
      else if (hiddenAt && Date.now() - hiddenAt > 5_000) void resyncCloud();
    });
    window.addEventListener('online', () => void resyncCloud());
    // Rede de segurança: confere a cada 2 min mesmo com a tela sempre aberta (TV, PC do escritório).
    setInterval(() => document.visibilityState === 'visible' && void resyncCloud(), 120_000);
  }

  let everConnected = false;
  unsubscribe?.();
  unsubscribe = b.subscribe(
    (ch) => {
      if (ch.table === 'profiles') return void profilesRepo?.applyRemote(ch.type === 'delete' ? { type: 'delete', id: ch.id } : { type: 'upsert', profile: ch.profile });
      if (ch.type === 'delete') remoteFor(ch.collection)?.applyRemote({ type: 'delete', id: ch.id });
      else remoteFor(ch.row.collection)?.applyRemote({ type: 'upsert', id: ch.row.id, data: ch.row.data });
    },
    (connected) => {
      // Reconectou depois de cair: busca o que se perdeu no intervalo.
      if (connected && everConnected && !realtimeConnected) void resyncCloud();
      if (connected) everConnected = true;
      realtimeConnected = connected;
      connectionListeners.forEach((l) => l(connected));
    },
  );
}

export function disconnectCloud(): void {
  unsubscribe?.();
  unsubscribe = null;
}
