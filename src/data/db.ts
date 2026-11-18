import { APP_CONFIG } from '@/lib/config';
import type { AppDatabase, Client, CollectionName, EntityOf } from '@/types/models';
import type { Entity } from './repository';
import { StoredRepository, type Repository } from './repository';
import { alignDemoHours, buildSeed, DEMO_PROJECT_NUMBERS, demoClients } from './seed';
import { LEGACY_DEMO_VALUES } from './legacyDemo';
import { AUDITED, audited, withoutAudit } from './audit';
import { createLocalStorageDriver } from './storage';
import { ProfilesRepository } from './cloud/profilesRepository';
import { RemoteRepository } from './cloud/remoteRepository';
import { CLOUD, EMAIL_AUTH, cloudBackend, syncQueue } from './cloud/runtime';

const driver = createLocalStorageDriver(APP_CONFIG.storagePrefix);

type Repos = { [K in CollectionName]: Repository<EntityOf<K>> };

const DATA_COLLECTIONS = [
  'requisitions', 'extensions', 'employees', 'projects', 'assignments', 'absences',
  'purchaseOrders', 'suppliers', 'materials', 'spindles', 'forecast', 'workPhases', 'timeEntries', 'shopfloorRequests', 'customers', 'projectUpdates', 'auditLog', 'clients',
] as const satisfies readonly Exclude<CollectionName, 'users'>[];

/** Modo nuvem: repositórios sincronizados com o Supabase; modo local: localStorage. */
function makeRepo<T extends Entity>(name: string): Repository<T> {
  return CLOUD ? new RemoteRepository<T>(name, syncQueue) : new StoredRepository<T>(driver, name);
}

export const profilesRepo = EMAIL_AUTH ? new ProfilesRepository(cloudBackend) : null;

/** Um repositório por coleção. Toda leitura/escrita da UI passa por aqui. */
const raw: Repos = {
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
  shopfloorRequests: makeRepo('shopfloorRequests'),
  customers: makeRepo('customers'),
  projectUpdates: makeRepo('projectUpdates'),
  auditLog: makeRepo('auditLog'),
  clients: makeRepo('clients'),
} as Repos;

/**
 * Coleções ligadas a projetos passam pelo histórico automático (`data/audit.ts`); as demais ficam como estão.
 * O próprio histórico é gravado no repositório "cru" (não se audita).
 */
export const repos: Repos = { ...raw };
for (const c of AUDITED) (repos as Record<string, unknown>)[c] = audited(c, raw[c] as never, raw.auditLog, () => raw.projects.getAll());

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

/** Nomes da demonstração antiga → atuais (migração única e idempotente). */
const LEGACY_RENAMES = {
  employees: [
    ['emp_carlos', 'Carlos Menezes', 'Emma'],
    ['emp_juliana', 'Juliana Prado', 'Dave'],
    ['emp_rafael', 'Rafael Souza', 'Nigel'],
    ['emp_marcos', 'Marcos Oliveira', 'Rupert'],
    ['emp_patricia', 'Patrícia Lima', 'Owen'],
    ['emp_eduardo', 'Eduardo Tanaka', 'Jaimie'],
  ],
  users: [
    ['u_log', 'Rafael Souza', 'Logistics'],
    ['u_log', 'Logística', 'Logistics'],
    ['u_office', 'Fernanda Alves', 'Office'],
  ],
  phases: [
    ['ph_1', 'Desmontagem', 'Disassembly'],
    ['ph_2', 'Inspeção / Diagnóstico', 'Inspection / Diagnosis'],
    ['ph_3', 'Limpeza', 'Cleaning'],
    ['ph_4', 'Remontagem', 'Reassembly'],
    ['ph_5', 'Balanceamento', 'Balancing'],
    ['ph_6', 'Teste', 'Testing'],
    ['ph_7', 'Embalagem', 'Packing'],
    ['ph_7', 'Packing', 'Packaging & Delivery'],
    ['ph_7', 'Delivery', 'Packaging & Delivery'],
  ],
} as const;

/**
 * Lê/troca um campo por caminho (`a.b`, `lista[id]` ou `lista[3]`) num clone do registro.
 * Devolve true se trocou (valor atual === `from`).
 */
function replaceAtPath(root: Record<string, unknown>, path: string, from: string, to: string): boolean {
  const parts = path.split('.');
  let node: unknown = root;
  for (let i = 0; i < parts.length; i++) {
    const m = /^([^[]+)(?:\[([^\]]+)\])?$/.exec(parts[i]!);
    if (!m || !node || typeof node !== 'object') return false;
    const [, key, sel] = m;
    const last = i === parts.length - 1;
    const obj = node as Record<string, unknown>;
    if (sel === undefined) {
      if (last) {
        if (obj[key!] !== from) return false;
        obj[key!] = to;
        return true;
      }
      node = obj[key!];
      continue;
    }
    const list = obj[key!];
    if (!Array.isArray(list)) return false;
    const idx = list.findIndex((x) => x && typeof x === 'object' && (x as { id?: unknown }).id === sel);
    const at = idx >= 0 ? idx : /^\d+$/.test(sel) ? Number(sel) : -1;
    if (at < 0 || at >= list.length) return false;
    if (last) {
      if (list[at] !== from) return false;
      list[at] = to;
      return true;
    }
    node = list[at];
  }
  return false;
}

function migrateLegacyDemoValues(): void {
  for (const [coll, rows] of Object.entries(LEGACY_DEMO_VALUES) as [CollectionName, ReadonlyArray<readonly [string, string, string, string]>][]) {
    if (coll === 'users' && EMAIL_AUTH) continue; // na nuvem com e-mail, contas = perfis do Supabase
    const repo = repos[coll] as unknown as Repository<Entity>;
    const changed = new Map<string, Record<string, unknown>>();
    for (const [id, path, from, to] of rows) {
      const cur = changed.get(id) ?? repo.getById(id);
      if (!cur) continue;
      const clone = changed.get(id) ?? (structuredClone(cur) as unknown as Record<string, unknown>);
      if (replaceAtPath(clone, path, from, to)) changed.set(id, clone);
    }
    for (const rec of changed.values()) repo.upsert(rec as unknown as Entity);
  }
}

const nname = (s: string) => s.trim().toLowerCase().replace(/\s+/g, ' ');

/**
 * - Cria clientes a partir dos nomes já usados (projetos, spindles, forecast, contas do portal); se o nome é de um cliente
 *   da demonstração, usa esse cadastro; senão cria um cadastro mínimo marcado como incompleto.
 * - Liga `clientId` nos registros pelo nome.
 * - PO do cliente: a PO de venda ligada ao projeto vira número/data/valor DO PROJETO (uma por projeto).
 */
function migrateClientsAndCustomerPOs(): void {
  const now = new Date().toISOString();
  const templates = new Map(demoClients(now).map((c) => [nname(c.name), c]));
  const byName = new Map(repos.clients.getAll().map((c) => [nname(c.name), c]));
  const names = [
    ...repos.projects.getAll().map((p) => p.customer),
    ...repos.spindles.getAll().map((s) => s.customer),
    ...repos.forecast.getAll().map((f) => f.customer),
    ...repos.customers.getAll().map((a) => a.name),
  ].filter((n) => n && n.trim());
  for (const n of names) {
    const k = nname(n);
    if (byName.has(k)) continue;
    const tpl = templates.get(k);
    const c: Client = tpl ?? {
      id: `cli_${Date.now().toString(36)}${Math.random().toString(36).slice(2, 7)}`,
      name: n.trim(),
      accountNumber: '',
      billingAddress: { line1: '', city: '', postcode: '', country: 'United Kingdom' },
      deliverySameAsBilling: true,
      contactName: '',
      email: '',
      phone: '',
      createdAt: now,
      incomplete: true,
    };
    if (repos.clients.getById(c.id)) continue;
    repos.clients.create(c);
    byName.set(k, c);
  }
  const idOf = (n: string) => byName.get(nname(n))?.id;
  for (const p of repos.projects.getAll()) if (!p.clientId && idOf(p.customer)) repos.projects.update(p.id, { clientId: idOf(p.customer) });
  for (const s of repos.spindles.getAll()) if (!s.clientId && idOf(s.customer)) repos.spindles.update(s.id, { clientId: idOf(s.customer) });
  for (const f of repos.forecast.getAll()) if (!f.clientId && idOf(f.customer)) repos.forecast.update(f.id, { clientId: idOf(f.customer) });
  for (const a of repos.customers.getAll()) if (!a.clientId && idOf(a.name)) repos.customers.update(a.id, { clientId: idOf(a.name) });

  const salesById = new Map(repos.purchaseOrders.getAll().filter((po) => po.kind === 'sales').map((po) => [po.id, po]));
  for (const p of repos.projects.getAll()) {
    const po = p.poId ? salesById.get(p.poId) : undefined;
    if (!po || (p.customerPoDate && p.customerPoValue !== undefined)) continue;
    repos.projects.update(p.id, {
      customerPoRef: p.customerPoRef || po.poNumber,
      customerPoDate: p.customerPoDate ?? po.orderDate,
      customerPoValue: p.customerPoValue ?? Math.round(po.lines.filter((l) => l.status !== 'canceled').reduce((s, l) => s + l.quantity * l.unitPrice, 0) * 100) / 100,
    });
  }
}

function migrateRequisitionSuppliers(): void {
  const pn = (x: string) => x.trim().toUpperCase().replace(/\s+/g, '');
  const today = new Date().toISOString().slice(0, 10);
  const catalog = repos.materials.getAll();
  for (const pr of repos.requisitions.getAll()) {
    if (pr.items.every((it) => it.suppliers !== undefined)) continue;
    const project = repos.projects.getById(pr.projectId);
    const items = pr.items.map((it) => {
      if (it.suppliers !== undefined) return it;
      const cm = catalog.find((m) => it.partNumber && pn(m.partNumber) === pn(it.partNumber));
      const suppliers = (cm?.offers ?? []).map((o) =>
        o.quoteStatus === 'received' && o.quotedPrice !== undefined && (!o.validUntil || o.validUntil >= today)
          ? { supplierId: o.supplierId, price: o.quotedPrice, leadTimeDays: o.leadTimeDays, validUntil: o.validUntil, quotedAt: o.quoteDate }
          : { supplierId: o.supplierId, ...(o.quoteStatus === 'requested' ? { rfqSentAt: o.quoteDate ?? pr.requestedAt } : {}) },
      );
      const mat = project?.materials.find((m) => m.id === it.materialId);
      const po = mat?.poId ? repos.purchaseOrders.getById(mat.poId) : undefined;
      if (po?.supplierId && !suppliers.some((s) => s.supplierId === po.supplierId)) suppliers.push({ supplierId: po.supplierId });
      return { ...it, suppliers, chosenSupplierId: po?.supplierId ?? it.chosenSupplierId };
    });
    repos.requisitions.update(pr.id, { items });
  }
}

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
      shopfloorRequests: [...repos.shopfloorRequests.getAll()],
      customers: [...repos.customers.getAll()],
      projectUpdates: [...repos.projectUpdates.getAll()],
      auditLog: [...repos.auditLog.getAll()],
      clients: [...repos.clients.getAll()],
    };
  },

  /** Substitui TODO o estado. */
  load(data: AppDatabase, source: Meta['source']): void {
    // Carga/migração não entra no histórico de mudanças.
    withoutAudit(() => {
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
      repos.shopfloorRequests.replaceAll(data.shopfloorRequests ?? []);
      repos.customers.replaceAll(data.customers ?? []);
      repos.projectUpdates.replaceAll(data.projectUpdates ?? []);
      repos.auditLog.replaceAll(data.auditLog ?? []);
    repos.clients.replaceAll(data.clients ?? []);
      db.ensureDefaults();
      writeMeta({ id: META_KEY, schemaVersion: APP_CONFIG.schemaVersion, initializedAt: new Date().toISOString(), source });
    });
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
    db.load({ users: buildSeed().users, requisitions: [], extensions: [], employees: [], projects: [], assignments: [], absences: [], purchaseOrders: [], suppliers: [], materials: [], spindles: [], forecast: [], workPhases: [], timeEntries: [], shopfloorRequests: [], customers: [], projectUpdates: [], auditLog: [], clients: [] }, 'empty');
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
    // Carga/migração não entra no histórico de mudanças.
    withoutAudit(() => {
      if (repos.workPhases.getAll().length === 0) repos.workPhases.replaceAll(buildSeed().workPhases);
      // Renomeia os nomes antigos da demonstração (só se ainda forem exatamente os antigos — edições são preservadas).
      for (const [id, from, to] of LEGACY_RENAMES.employees) {
        const e = repos.employees.getById(id);
        if (e?.name === from) repos.employees.upsert({ ...e, name: to });
      }
      for (const [id, from, to] of LEGACY_RENAMES.users) {
        const u = repos.users.getById(id);
        if (u?.name === from) repos.users.upsert({ ...u, name: to });
      }
      for (const [id, from, to] of LEGACY_RENAMES.phases) {
        const ph = repos.workPhases.getById(id);
        if (ph?.name === from) repos.workPhases.upsert({ ...ph, name: to });
      }
      // Fase "Balancing" da demo foi retirada do padrão: some se ainda tiver o nome original e só houver apontamentos
      // da demonstração nela (ids `te_<n>`; apontamentos reais têm id gerado por newId e preservam a fase).
      const bal = repos.workPhases.getById('ph_5');
      if (bal && /^(Balancing|Balanceamento)$/.test(bal.name)) {
        const balEntries = repos.timeEntries.getAll().filter((e) => e.phaseId === bal.id);
        if (balEntries.every((e) => /^te_\d{1,3}$/.test(e.id))) {
          if (balEntries.length) repos.timeEntries.replaceAll(repos.timeEntries.getAll().filter((e) => e.phaseId !== bal.id));
          repos.workPhases.replaceAll(repos.workPhases.getAll().filter((p) => p.id !== bal.id).sort((x, y) => x.order - y.order).map((p, i) => ({ ...p, order: i + 1 })));
        }
      }
      // Projetos já concluídos vão para o arquivo (uma vez; recuperados têm archived=false e ficam).
      for (const p of repos.projects.getAll()) if (p.status === 'completed' && p.archived === undefined) repos.projects.update(p.id, { archived: true, archivedAt: new Date().toISOString() });
      // Pedidos de compra antigos: fornecedores por item vêm do catálogo (cotação válida vira preço) e da PO já registrada.
      migrateRequisitionSuppliers();
      // Demonstração já carregada: horas da demo fora da agenda passam a bater com a agenda (só ids da demo).
      // Nunca impede o app de abrir: um ajuste de demonstração que falhe é só ignorado.
      try {
        const r = alignDemoHours(repos.timeEntries.getAll(), repos.assignments.getAll(), repos.absences.getAll(), repos.employees.getAll().filter((e) => e.status === 'active').map((e) => e.id));
        for (const id of r.removed) repos.assignments.remove(id);
        for (const a of r.added) if (!repos.assignments.getById(a.id)) repos.assignments.create(a);
        if (r.changed) for (const e of r.entries) if (repos.timeEntries.getById(e.id)?.employeeId !== e.employeeId) repos.timeEntries.update(e.id, { employeeId: e.employeeId });
      } catch (err) {
        console.warn('alignDemoHours skipped', err);
      }
      // Cadastro único de clientes + PO do cliente dentro do projeto (bases criadas antes destas mudanças).
      migrateClientsAndCustomerPOs();
      // Textos da demonstração antiga em português → inglês (só valores ainda idênticos aos originais).
      migrateLegacyDemoValues();
      // Nº de projeto antigo da demo (PRJ-AAMM-NNN) → formato 1000 + 4 letras.
      for (const p of repos.projects.getAll()) {
        const m = /^prj_(\d{3})$/.exec(p.id);
        const to = m ? DEMO_PROJECT_NUMBERS[Number(m[1]) - 1] : undefined;
        if (to && /^PRJ-\d{4}-\d{3}$/.test(p.projectNumber)) repos.projects.upsert({ ...p, projectNumber: to });
      }
    });
  },

  isEmpty(): boolean {
    // As fases padrão da oficina são criadas automaticamente: não contam como dados de negócio.
    return DATA_COLLECTIONS.every((c) => c === 'workPhases' || repos[c].getAll().length === 0);
  },
};
