/**
 * Driver de armazenamento chave/valor. A aplicação depende apenas desta interface,
 * permitindo trocar `localStorage` por IndexedDB/API REST sem tocar nos módulos.
 */
export interface StorageDriver {
  read<T>(key: string): T | undefined;
  write<T>(key: string, value: T): void;
  remove(key: string): void;
}

/** Fallback em memória (navegação privada, storage bloqueado, testes). */
export function createMemoryDriver(): StorageDriver {
  const mem = new Map<string, string>();
  return {
    read: <T,>(key: string) => {
      const raw = mem.get(key);
      return raw === undefined ? undefined : (JSON.parse(raw) as T);
    },
    write: (key, value) => void mem.set(key, JSON.stringify(value)),
    remove: (key) => void mem.delete(key),
  };
}

export function createLocalStorageDriver(prefix: string): StorageDriver {
  const k = (key: string) => `${prefix}:${key}`;
  let ls: Storage | undefined;
  try {
    ls = window.localStorage;
    const probe = k('__probe__');
    ls.setItem(probe, '1');
    ls.removeItem(probe);
  } catch {
    console.warn('[storage] localStorage indisponível — usando memória.');
    return createMemoryDriver();
  }
  const storage = ls;
  return {
    read<T>(key: string): T | undefined {
      try {
        const raw = storage.getItem(k(key));
        return raw === null ? undefined : (JSON.parse(raw) as T);
      } catch (err) {
        console.error(`[storage] falha ao ler "${key}"`, err);
        return undefined;
      }
    },
    write(key, value) {
      try {
        storage.setItem(k(key), JSON.stringify(value));
      } catch (err) {
        console.error(`[storage] falha ao gravar "${key}"`, err);
        throw new Error('Não foi possível salvar os dados (armazenamento cheio ou bloqueado).');
      }
    },
    remove(key) {
      try {
        storage.removeItem(k(key));
      } catch {
        /* ignore */
      }
    },
  };
}
