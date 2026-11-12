import { APP_CONFIG } from '@/lib/config';
import type { AppDatabase, CollectionName, EntityOf } from '@/types/models';
import { StoredRepository, type Repository } from './repository';
import { buildSeed } from './seed';
import { createLocalStorageDriver } from './storage';

const driver = createLocalStorageDriver(APP_CONFIG.storagePrefix);

type Repos = { [K in CollectionName]: Repository<EntityOf<K>> };

/** Um repositório por coleção. Toda leitura/escrita da UI passa por aqui. */
export const repos: Repos = {
  employees: new StoredRepository(driver, 'employees'),
  activities: new StoredRepository(driver, 'activities'),
  purchaseOrders: new StoredRepository(driver, 'purchaseOrders'),
  spindles: new StoredRepository(driver, 'spindles'),
  forecast: new StoredRepository(driver, 'forecast'),
};

export const COLLECTIONS = Object.keys(repos) as CollectionName[];

interface Meta {
  schemaVersion: number;
  initializedAt: string;
  source: 'demo' | 'empty' | 'import';
}

const META_KEY = 'meta';

export const db = {
  /** Popula com dados de demonstração no primeiro acesso. */
  ensureInitialized(): void {
    const meta = driver.read<Meta>(META_KEY);
    if (!meta) db.resetToDemo();
  },

  /** Snapshot completo (base do backup JSON / exportação Excel). */
  snapshot(): AppDatabase {
    return {
      employees: [...repos.employees.getAll()],
      activities: [...repos.activities.getAll()],
      purchaseOrders: [...repos.purchaseOrders.getAll()],
      spindles: [...repos.spindles.getAll()],
      forecast: [...repos.forecast.getAll()],
    };
  },

  /** Substitui TODO o estado. */
  load(data: AppDatabase, source: Meta['source']): void {
    repos.employees.replaceAll(data.employees);
    repos.activities.replaceAll(data.activities);
    repos.purchaseOrders.replaceAll(data.purchaseOrders);
    repos.spindles.replaceAll(data.spindles);
    repos.forecast.replaceAll(data.forecast);
    driver.write<Meta>(META_KEY, {
      schemaVersion: APP_CONFIG.schemaVersion,
      initializedAt: new Date().toISOString(),
      source,
    });
  },

  resetToDemo(): void {
    db.load(buildSeed(), 'demo');
  },

  clearAll(): void {
    db.load({ employees: [], activities: [], purchaseOrders: [], spindles: [], forecast: [] }, 'empty');
  },

  getMeta(): Meta | undefined {
    return driver.read<Meta>(META_KEY);
  },
};
