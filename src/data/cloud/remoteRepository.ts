import type { Entity, Repository } from '../repository';
import type { SyncQueue } from './syncQueue';

type Listener = () => void;

/** JSON estável (chaves ordenadas): o Postgres reordena chaves do jsonb. */
export function stableStringify(v: unknown): string {
  if (v === null || typeof v !== 'object') return JSON.stringify(v) ?? 'null';
  if (Array.isArray(v)) return `[${v.map(stableStringify).join(',')}]`;
  const o = v as Record<string, unknown>;
  return `{${Object.keys(o)
    .filter((k) => o[k] !== undefined)
    .sort()
    .map((k) => `${JSON.stringify(k)}:${stableStringify(o[k])}`)
    .join(',')}}`;
}

const strip = <T,>(x: T): T => JSON.parse(JSON.stringify(x)) as T;

/**
 * Repositório sincronizado com a nuvem. Leituras são síncronas (cache em memória, igual ao modo
 * local); escritas atualizam o cache na hora (otimista) e entram na fila de envio. Alterações de
 * outros usuários chegam por `applyRemote` (tempo real).
 */
export class RemoteRepository<T extends Entity> implements Repository<T> {
  private cache: readonly T[] = Object.freeze([]);
  private listeners = new Set<Listener>();

  constructor(
    readonly collection: string,
    private queue: SyncQueue,
  ) {}

  private emit() {
    this.listeners.forEach((l) => l());
  }

  private set(next: T[]) {
    this.cache = Object.freeze(next);
    this.emit();
  }

  /** Carga inicial (substitui o cache sem enviar nada). */
  hydrate(items: T[]): void {
    this.set(items);
  }

  /** Alteração vinda do servidor (outro usuário ou eco da própria gravação). */
  applyRemote(change: { type: 'upsert'; id: string; data: unknown } | { type: 'delete'; id: string }): void {
    if (this.queue.isPending(this.collection, change.id)) return; // a versão local mais nova prevalece
    const idx = this.cache.findIndex((x) => x.id === change.id);
    if (change.type === 'delete') {
      if (idx >= 0) this.set(this.cache.filter((x) => x.id !== change.id));
      return;
    }
    const item = { ...(change.data as T), id: change.id };
    if (idx >= 0) {
      if (stableStringify(this.cache[idx]) === stableStringify(item)) return;
      this.set(this.cache.map((x, i) => (i === idx ? item : x)));
    } else this.set([...this.cache, item]);
  }

  getAll = (): readonly T[] => this.cache;

  getById(id: string): T | undefined {
    return this.cache.find((x) => x.id === id);
  }

  create(item: T): T {
    if (this.getById(item.id)) throw new Error(`Registro duplicado: ${item.id}`);
    const clean = strip(item);
    this.set([...this.cache, clean]);
    this.queue.enqueue(this.collection, [{ id: clean.id, data: clean }], []);
    return clean;
  }

  update(id: string, patch: Partial<Omit<T, 'id'>>): T {
    const current = this.getById(id);
    if (!current) throw new Error(`Registro não encontrado: ${id}`);
    const next = strip({ ...current, ...patch, id } as T);
    this.set(this.cache.map((x) => (x.id === id ? next : x)));
    this.queue.enqueue(this.collection, [{ id, data: next }], []);
    return next;
  }

  upsert(item: T): T {
    return this.getById(item.id) ? this.update(item.id, item) : this.create(item);
  }

  remove(id: string): void {
    if (!this.getById(id)) return;
    this.set(this.cache.filter((x) => x.id !== id));
    this.queue.enqueue(this.collection, [], [id]);
  }

  /** Substitui tudo enviando apenas a diferença (novos/alterados e removidos). */
  replaceAll(items: T[]): void {
    const next = items.map(strip);
    const before = new Map(this.cache.map((x) => [x.id, stableStringify(x)]));
    const ids = new Set(next.map((x) => x.id));
    const upserts = next.filter((x) => before.get(x.id) !== stableStringify(x)).map((x) => ({ id: x.id, data: x }));
    const deletes = [...before.keys()].filter((id) => !ids.has(id));
    this.set(next);
    this.queue.enqueue(this.collection, upserts, deletes);
  }

  subscribe = (listener: Listener): (() => void) => {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  };
}
