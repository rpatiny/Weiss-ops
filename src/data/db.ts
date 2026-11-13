import { APP_CONFIG } from '@/lib/config';
import type { AppDatabase, CollectionName, EntityOf } from '@/types/models';
import type { Entity } from './repository';
import { StoredRepository, type Repository } from './repository';
import { buildSeed } from './seed';
import { createLocalStorageDriver } from './storage';
import { ProfilesRepository } from './cloud/profilesRepository';
import { RemoteRepository } from './cloud/remoteRepository';
import { CLOUD, EMAIL_AUTH, cloudBackend, syncQueue } from './cloud/runtime';

const driver = createLocalStorageDriver(APP_CONFIG.storagePrefix);

type Repos = { [K in CollectionName]: Repository<EntityOf<K>> };

const DATA_COLLECTIONS = [
  'requisitions', 'extensions', 'employees', 'projects', 'assignments', 'absences',
  'purchaseOrders', 'suppliers', 'materials', 'spindles', 'forecast', 'workPhases', 'timeEntries',
] as const satisfies readonly Exclude<CollectionName, 'users'>[];

/** Modo nuvem: repositórios sincronizados com o Supabase; modo local: localStorage. */
function makeRepo<T extends Entity>(name: string): Repository<T> {
  return CLOUD ? new RemoteRepository<T>(name, syncQueue) : new StoredRepository<T>(driver, name);
}

export const profilesRepo = EMAIL_AUTH ? new ProfilesRepository(cloudBackend) : null;

/** Um repositório por coleção. Toda leitura/escrita da UI passa por aqui. */
export const repos: Repos = {
  users: profilesRepo ?? makeRepo('users'),
  requisitions: makeRepo('requisitions'),
  extensions: makeRepo('extensions'),
  employees: makeRepo('employees'),
  projects: makeRepo('projects'),
  assignments: makeRepo('assignments'),
  absences: makeRepo('absences'),
  purchaseOrders: makeRepo('purchaseOrders'),
  suppliers: makeRepo('suppliers'),
  materials: makeRepo('materials'),
  spindles: makeRepo('spindles'),
  forecast: makeRepo('forecast'),
  workPhases: makeRepo('workPhases'),
  timeEntries: makeRepo('timeEntries'),
} as Repos;

export const COLLECTIONS = Object.keys(repos) as CollectionName[];
export { CLOUD, EMAIL_AUTH, DATA_COLLECTIONS };

interface Meta {
  id: string;
  schemaVersion: number;
  initializedAt: string;
  source: 'demo' | 'empty' | 'import';
}

const META_KEY = 'meta';
/** Metadados: no modo nuvem ficam no próprio banco (coleção `_meta`), compartilhados por todos. */
export const metaRepo = CLOUD ? new RemoteRepository<Meta>('_meta', syncQueue) : null;
const readMeta = (): Meta | undefined => (metaRepo ? metaRepo.getById(META_KEY) : driver.read<Meta>(META_KEY));
const writeMeta = (m: Meta) => (metaRepo ? metaRepo.upsert(m) : driver.write<Meta>(META_KEY, m));

export const db = {
  /**
   * Popula com dados de demonstração no primeiro acesso. Se a base local tiver um
   * schema antigo (ex.: v1 com atividades diárias), é recriada com a demo atual.
   */
  ensureInitialized(): void {
    if (CLOUD) return; // na nuvem a base começa vazia; o Master importa um backup ou carrega a demo
    const meta = driver.read<Meta>(META_KEY);
    if (!meta || meta.schemaVersion < APP_CONFIG.schemaVersion) {
      driver.remove('activities'); // coleção do schema v1
      db.resetToDemo();
    }
    db.ensureDefaults();
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
      workPhases: [...repos.workPhases.getAll()],
      timeEntries: [...repos.timeEntries.getAll()],
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
    // Coleções novas: backups antigos não as têm.
    repos.workPhases.replaceAll(data.workPhases ?? []);
    repos.timeEntries.replaceAll(data.timeEntries ?? []);
    db.ensureDefaults();
    writeMeta({ id: META_KEY, schemaVersion: APP_CONFIG.schemaVersion, initializedAt: new Date().toISOString(), source });
  },

  resetToDemo(currentUserId?: string): void {
    const seed = buildSeed();
    if (EMAIL_AUTH && currentUserId) {
      // Na nuvem os usuários são as contas reais: autorias da demo passam para quem carregou.
      const demoUsers = new Set(seed.users.map((u) => u.id));
      const map = (id: string) => (demoUsers.has(id) ? currentUserId : id);
      seed.requisitions = seed.requisitions.map((r) => ({ ...r, requestedBy: map(r.requestedBy), history: r.history.map((h) => ({ ...h, userId: map(h.userId) })) }));
      seed.extensions = seed.extensions.map((x) => ({ ...x, requestedBy: map(x.requestedBy), history: x.history.map((h) => ({ ...h, userId: map(h.userId) })) }));
      seed.purchaseOrders = seed.purchaseOrders.map((p) => ({ ...p, lines: p.lines.map((l) => ({ ...l, receipts: l.receipts?.map((r) => ({ ...r, receivedBy: map(r.receivedBy) })) })) }));
    }
    db.load(seed, 'demo');
  },

  clearAll(): void {
    db.load({ users: buildSeed().users, requisitions: [], extensions: [], employees: [], projects: [], assignments: [], absences: [], purchaseOrders: [], suppliers: [], materials: [], spindles: [], forecast: [], workPhases: [], timeEntries: [] }, 'empty');
  },

  getMeta(): Meta | undefined {
    return readMeta();
  },

  /** Base sem nenhum dado de negócio (usado para orientar o Master no primeiro acesso à nuvem). */
  /** Nuvem com login por PIN: garante os usuários padrão (Master 1234 / Logística 2222 / Office 3333) na primeira vez. */
  ensureUsers(): void {
    if (repos.users.getAll().length === 0) repos.users.replaceAll(buildSeed().users);
  },

  /** Cadastros padrão que precisam existir (fases da oficina) — também em bases antigas. */
  ensureDefaults(): void {
    if (repos.workPhases.getAll().length === 0) repos.workPhases.replaceAll(buildSeed().workPhases);
  },

  isEmpty(): boolean {
    return DATA_COLLECTIONS.every((c) => repos[c].getAll().length === 0);
  },
};
