import { useSyncExternalStore } from 'react';
import type { CollectionName, EntityOf } from '@/types/models';
import { repos } from './db';

/** Assina uma coleção; re-renderiza apenas quando ela muda. */
export function useCollection<K extends CollectionName>(name: K): readonly EntityOf<K>[] {
  const repo = repos[name];
  return useSyncExternalStore(repo.subscribe, repo.getAll, repo.getAll);
}
