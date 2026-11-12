import { APP_CONFIG } from '@/lib/config';
import type { AppDatabase, CollectionName, EntityOf } from '@/types/models';
import { StoredRepository, type Repository } from './repository';
import { buildSeed } from './seed';
import { createLocalStorageDriver } from './storage';

const driver = createLocalStorageDriver(APP_CONFIG.storagePrefix);

type Repos = { [K in CollectionName]: Repository<EntityOf<K>> };

/** Um repositório por coleção. Toda leitura/escrita da UI passa por aqui. */
export const repos: Repos = {
  users: new StoredRepository(driver, 'users'),
  requisitions: new StoredRepository(driver, 'requisitions'),
  extensions: new StoredRepository(driver, 'extensions'),
  employees: new StoredRepository(driver, 'employees'),
  projects: new StoredRepository(driver, 'projects'),
  assignments: new StoredRepository(driver, 'assignments'),
  absences: new StoredRepository(driver, 'absences'),
  purchaseOrders: new StoredRepository(driver, 'purchaseOrders'),
  suppliers: new StoredRepository(driver, 'suppliers'),
  materials: new StoredRepository(driver, 'materials'),
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
  /**
   * Popula com dados de demonstração no primeiro acesso. Se a base local tiver um
   * schema antigo (ex.: v1 com atividades diárias), é recriada com a demo atual.
   */
  ensureInitialized(): void {
    const meta = driver.read<Meta>(META_KEY);
    if (!meta || meta.schemaVersion < APP_CONFIG.schemaVersion) {
      driver.remove('activities'); // coleção do schema v1
      db.resetToDemo();
    }
  },

  /** Snapshot completo (base do backup JSON / exportação Excel). */
  snapshot(): AppDatabase {
    return {
      users: [...repos.users.getAll()],
      requisitions: [...repos.requisitions.getAll()],
      extensions: [...repos.extensions.getAll()],
      employees: [...repos.employees.getAll()],
      projects: [...repos.projects.getAll()],
      assignments: [...repos.assignments.getAll()],
      absences: [...repos.absences.getAll()],
      purchaseOrders: [...repos.purchaseOrders.getAll()],
      suppliers: [...repos.suppliers.getAll()],
      materials: [...repos.materials.getAll()],
      spindles: [...repos.spindles.getAll()],
      forecast: [...repos.forecast.getAll()],
    };
  },

  /** Substitui TODO o estado. */
  load(data: AppDatabase, source: Meta['source']): void {
    repos.users.replaceAll(data.users);
    repos.requisitions.replaceAll(data.requisitions);
    repos.extensions.replaceAll(data.extensions);
    repos.employees.replaceAll(data.employees);
    repos.projects.replaceAll(data.projects);
    repos.assignments.replaceAll(data.assignments);
    repos.absences.replaceAll(data.absences);
    repos.purchaseOrders.replaceAll(data.purchaseOrders);
    repos.suppliers.replaceAll(data.suppliers);
    repos.materials.replaceAll(data.materials);
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
    db.load({ users: buildSeed().users, requisitions: [], extensions: [], employees: [], projects: [], assignments: [], absences: [], purchaseOrders: [], suppliers: [], materials: [], spindles: [], forecast: [] }, 'empty');
  },

  getMeta(): Meta | undefined {
    return driver.read<Meta>(META_KEY);
  },
};
