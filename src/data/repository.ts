import type { StorageDriver } from './storage';

export interface Entity {
  id: string;
}

type Listener = () => void;

/** Contrato de repositório usado por toda a UI (independente do armazenamento). */
export interface Repository<T extends Entity> {
  /** Retorna um snapshot imutável (mesma referência até a próxima mutação). */
  getAll(): readonly T[];
  getById(id: string): T | undefined;
  create(item: T): T;
  update(id: string, patch: Partial<Omit<T, 'id'>>): T;
  /** Insere ou substitui pelo `id`. */
  upsert(item: T): T;
  remove(id: string): void;
  replaceAll(items: T[]): void;
  subscribe(listener: Listener): () => void;
}

/**
 * Repositório genérico persistido via StorageDriver.
 * Mantém cache em memória e notifica assinantes (compatível com useSyncExternalStore).
 */
export class StoredRepository<T extends Entity> implements Repository<T> {
  private cache: readonly T[] | null = null;
  private listeners = new Set<Listener>();

  constructor(
    private readonly driver: StorageDriver,
    readonly key: string,
  ) {}

  private load(): readonly T[] {
    if (this.cache === null) {
      const stored = this.driver.read<T[]>(this.key);
      this.cache = Object.freeze(Array.isArray(stored) ? stored : []);
    }
    return this.cache;
  }

  private commit(next: T[]): void {
    this.driver.write(this.key, next);
    this.cache = Object.freeze(next);
    this.listeners.forEach((l) => l());
  }

  getAll = (): readonly T[] => this.load();

  getById(id: string): T | undefined {
    return this.load().find((x) => x.id === id);
  }

  create(item: T): T {
    if (this.getById(item.id)) throw new Error(`Registro duplicado: ${item.id}`);
    this.commit([...this.load(), item]);
    return item;
  }

  update(id: string, patch: Partial<Omit<T, 'id'>>): T {
    const current = this.getById(id);
    if (!current) throw new Error(`Registro não encontrado: ${id}`);
    const next = { ...current, ...patch, id } as T;
    this.commit(this.load().map((x) => (x.id === id ? next : x)));
    return next;
  }

  upsert(item: T): T {
    return this.getById(item.id) ? this.update(item.id, item) : this.create(item);
  }

  remove(id: string): void {
    this.commit(this.load().filter((x) => x.id !== id));
  }

  replaceAll(items: T[]): void {
    this.commit([...items]);
  }

  subscribe = (listener: Listener): (() => void) => {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  };
}
