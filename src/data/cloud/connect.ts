import { metaRepo, profilesRepo, repos, DATA_COLLECTIONS } from '../db';
import type { RemoteRepository } from './remoteRepository';
import type { Entity } from '../repository';
import { EMAIL_AUTH, getCloudBackend } from './runtime';

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
export async function connectCloud(): Promise<void> {
  const b = await getCloudBackend();
  const [profiles, rows] = await Promise.all([EMAIL_AUTH ? b.fetchProfiles() : Promise.resolve([]), b.fetchAll()]);
  profilesRepo?.hydrate(profiles);
  const grouped = new Map<string, Entity[]>();
  for (const r of rows) grouped.set(r.collection, [...(grouped.get(r.collection) ?? []), { ...(r.data as Entity), id: r.id }]);
  for (const c of [...DATA_COLLECTIONS, '_meta', ...(EMAIL_AUTH ? [] : ['users'])]) remoteFor(c)?.hydrate(grouped.get(c) ?? []);

  unsubscribe?.();
  unsubscribe = b.subscribe(
    (ch) => {
      if (ch.table === 'profiles') return void profilesRepo?.applyRemote(ch.type === 'delete' ? { type: 'delete', id: ch.id } : { type: 'upsert', profile: ch.profile });
      if (ch.type === 'delete') remoteFor(ch.collection)?.applyRemote({ type: 'delete', id: ch.id });
      else remoteFor(ch.row.collection)?.applyRemote({ type: 'upsert', id: ch.row.id, data: ch.row.data });
    },
    (connected) => {
      realtimeConnected = connected;
      connectionListeners.forEach((l) => l(connected));
    },
  );
}

export function disconnectCloud(): void {
  unsubscribe?.();
  unsubscribe = null;
}
