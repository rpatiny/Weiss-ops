/**
 * Histórico de mudanças (auditoria) — registrado AUTOMATICAMENTE na camada de dados.
 *
 * Toda gravação (create/update/upsert/remove/replaceAll) nas coleções ligadas a projetos compara antes × depois e anota
 * quem fez, quando e o que mudou (campo: antes → depois). O projeto é o "coração": cada entrada guarda os projetos afetados.
 * Cargas de backup/demo e migrações ficam fora (`withoutAudit`). Fotos aparecem só como contagem.
 */
import type { AuditEntry, CollectionName, Project } from '@/types/models';
import type { Entity, Repository } from './repository';

type AnyRec = Record<string, unknown> & Entity;

// ───────── Quem está fazendo (injetado pela sessão — evita import circular) ─────────

export type AuditActor = { kind: 'user' | 'employee' | 'system'; id: string; name: string };
let actorProvider: () => AuditActor | null = () => null;
export const setAuditActorProvider = (fn: () => AuditActor | null) => (actorProvider = fn);
let employeeName: (id: string) => string = () => '';
export const setAuditEmployeeLookup = (fn: (id: string) => string) => (employeeName = fn);

// ───────── Pausa (carga de backup/demo, migrações) ─────────

let paused = 0;
export function withoutAudit<T>(fn: () => T): T {
  paused++;
  try {
    return fn();
  } finally {
    paused--;
  }
}

// ───────── Diferenças legíveis ─────────

/** Campos que não interessam no histórico (controle interno / visualização). */
const SKIP = new Set(['id', 'requesterSeenAt', 'pinHash', 'clockPinHash', 'portalToken']);
const MAX = 70;

function fmt(v: unknown): string {
  if (v === undefined || v === null || v === '') return '—';
  if (typeof v === 'string') {
    if (v.startsWith('data:')) return '[photo]';
    return v.length > MAX ? `${v.slice(0, MAX)}…` : v;
  }
  if (typeof v === 'number' || typeof v === 'boolean') return String(v);
  if (Array.isArray(v)) return `[${v.length}]`;
  return '{…}';
}

const same = (a: unknown, b: unknown) => JSON.stringify(a ?? null) === JSON.stringify(b ?? null);
const isObjList = (v: unknown): v is AnyRec[] => Array.isArray(v) && v.every((x) => x && typeof x === 'object' && typeof (x as AnyRec).id === 'string');
const itemLabel = (x: AnyRec) => String(x.partNumber || x.description || x.grNumber || x.number || x.name || x.id);

/** Lista de mudanças "campo: antes → depois" (um nível; listas com id viram adicionado/removido/alterado). */
export function diff(before: AnyRec | undefined, after: AnyRec | undefined, prefix = ''): string[] {
  const out: string[] = [];
  const keys = new Set([...Object.keys(before ?? {}), ...Object.keys(after ?? {})]);
  for (const k of keys) {
    if (SKIP.has(k)) continue;
    const a = before?.[k];
    const b = after?.[k];
    if (same(a, b)) continue;
    const name = prefix + k;
    if (isObjList(a ?? []) && isObjList(b ?? []) && (Array.isArray(a) || Array.isArray(b))) {
      const am = new Map(((a as AnyRec[]) ?? []).map((x) => [x.id, x]));
      const bm = new Map(((b as AnyRec[]) ?? []).map((x) => [x.id, x]));
      for (const [id, x] of bm) if (!am.has(id)) out.push(`${name} + ${itemLabel(x)}`);
      for (const [id, x] of am) if (!bm.has(id)) out.push(`${name} − ${itemLabel(x)}`);
      for (const [id, x] of bm) {
        const old = am.get(id);
        if (old && !same(old, x)) for (const c of diff(old, x, `${name}[${itemLabel(x)}].`)) out.push(c);
      }
      continue;
    }
    if (Array.isArray(a) || Array.isArray(b)) {
      const la = Array.isArray(a) ? a.length : 0;
      const lb = Array.isArray(b) ? b.length : 0;
      out.push(`${name}: ${la} → ${lb}`);
      continue;
    }
    out.push(`${name}: ${fmt(a)} → ${fmt(b)}`);
  }
  return out;
}

// ───────── Ligação com o projeto ─────────

type ProjectsGetter = () => readonly Project[];

/** Projetos afetados por um registro de cada coleção. */
function projectIdsOf(collection: CollectionName, rec: AnyRec, projects: ProjectsGetter): string[] {
  switch (collection) {
    case 'projects':
      return [rec.id];
    case 'assignments':
    case 'timeEntries':
    case 'projectUpdates':
    case 'requisitions':
    case 'shopfloorRequests':
      return typeof rec.projectId === 'string' && rec.projectId ? [rec.projectId] : [];
    case 'purchaseOrders':
      return projects()
        .filter((p) => p.poId === rec.id || p.materials.some((m) => m.poId === rec.id))
        .map((p) => p.id);
    case 'spindles':
      return projects()
        .filter((p) => p.spindleId === rec.id)
        .map((p) => p.id);
    case 'clients':
      return projects()
        .filter((p) => p.clientId === rec.id)
        .map((p) => p.id);
    default:
      return [];
  }
}

/** Nome curto do registro no texto do histórico. */
function recordLabel(collection: CollectionName, r: AnyRec): string {
  switch (collection) {
    case 'projects':
      return String(r.projectNumber ?? '');
    case 'assignments':
      return `${employeeName(String(r.employeeId))} ${r.startDate}→${r.endDate}`;
    case 'timeEntries':
      return `${employeeName(String(r.employeeId))} ${String(r.start ?? '').slice(0, 16).replace('T', ' ')}`;
    case 'requisitions':
    case 'shopfloorRequests':
      return String(r.number ?? '');
    case 'purchaseOrders':
      return String(r.poNumber ?? '');
    case 'spindles':
      return String(r.serialNumber ?? '');
    case 'clients':
      return String(r.name ?? '');
    case 'projectUpdates':
      return `${r.kind}: ${fmt(r.title)}`;
    default:
      return r.id;
  }
}

/** Coleções acompanhadas pelo histórico. */
export const AUDITED: readonly CollectionName[] = ['clients', 'projects', 'assignments', 'timeEntries', 'projectUpdates', 'requisitions', 'shopfloorRequests', 'purchaseOrders', 'spindles'];

const MAX_ENTRIES = 5000;

/**
 * Envolve um repositório: escreve normalmente e anota no histórico. Métodos que não gravam (getAll, subscribe, hydrate,
 * applyRemote do modo nuvem…) passam direto — eventos que chegam de outros usuários não são duplicados aqui.
 */
export function audited<T extends Entity>(collection: CollectionName, repo: Repository<T>, log: Repository<AuditEntry>, projects: ProjectsGetter): Repository<T> {
  const record = (before: AnyRec | undefined, after: AnyRec | undefined, action: AuditEntry['action']) => {
    if (paused) return;
    const rec = (after ?? before)!;
    const changes = action === 'update' ? diff(before, after) : action === 'create' ? diff(undefined, after).slice(0, 12) : [];
    if (action === 'update' && changes.length === 0) return;
    const ids = [...new Set([...projectIdsOf(collection, rec, projects), ...(before ? projectIdsOf(collection, before, projects) : [])])];
    if (ids.length === 0) return;
    // Registros do ponto/QR (sem login) são sempre do engenheiro, mesmo que alguém esteja logado no mesmo navegador.
    const fromShopFloor = rec.source === 'qr' || (collection === 'shopfloorRequests' && action === 'create') || (rec.author as { kind?: string } | undefined)?.kind === 'employee';
    let actor = fromShopFloor && action === 'create' ? null : actorProvider();
    if (!actor) {
      // Sem login (ponto / pedido do shop floor): o engenheiro do próprio registro.
      const empId = typeof rec.employeeId === 'string' ? rec.employeeId : (rec.author as { kind?: string; id?: string } | undefined)?.kind === 'employee' ? (rec.author as { id: string }).id : undefined;
      actor = empId ? { kind: 'employee', id: empId, name: `${employeeName(empId)} (time clock)` } : { kind: 'system', id: 'system', name: 'System' };
    }
    const entry: AuditEntry = {
      id: `aud_${Date.now().toString(36)}${Math.random().toString(36).slice(2, 8)}`,
      at: new Date().toISOString(),
      projectIds: ids,
      collection,
      recordId: rec.id,
      label: recordLabel(collection, rec),
      action,
      actor: actor.name,
      actorKind: actor.kind,
      changes,
    };
    log.create(entry);
    const all = log.getAll();
    if (all.length > MAX_ENTRIES) log.replaceAll([...all].sort((a, b) => a.at.localeCompare(b.at)).slice(-MAX_ENTRIES));
  };

  const wrapped: Partial<Repository<T>> = {
    create(item: T) {
      const r = repo.create(item);
      record(undefined, r as unknown as AnyRec, 'create');
      return r;
    },
    update(id, patch) {
      const before = repo.getById(id) as unknown as AnyRec | undefined;
      const r = repo.update(id, patch);
      record(before, r as unknown as AnyRec, 'update');
      return r;
    },
    upsert(item: T) {
      const before = repo.getById(item.id) as unknown as AnyRec | undefined;
      const r = repo.upsert(item);
      record(before, r as unknown as AnyRec, before ? 'update' : 'create');
      return r;
    },
    remove(id: string) {
      const before = repo.getById(id) as unknown as AnyRec | undefined;
      repo.remove(id);
      if (before) record(before, undefined, 'delete');
    },
    replaceAll(items: T[]) {
      if (paused) return repo.replaceAll(items);
      const before = new Map(repo.getAll().map((x) => [x.id, x as unknown as AnyRec]));
      repo.replaceAll(items);
      const after = new Map(repo.getAll().map((x) => [x.id, x as unknown as AnyRec]));
      for (const [id, b] of after) {
        const a = before.get(id);
        if (!a) record(undefined, b, 'create');
        else if (!same(a, b)) record(a, b, 'update');
      }
      for (const [id, a] of before) if (!after.has(id)) record(a, undefined, 'delete');
    },
  };
  return new Proxy(repo, {
    get(target, prop, receiver) {
      if (typeof prop === 'string' && prop in wrapped) return (wrapped as Record<string, unknown>)[prop];
      const v = Reflect.get(target, prop, receiver);
      return typeof v === 'function' ? v.bind(target) : v;
    },
  });
}

/** Texto do histórico de um projeto (mais recente primeiro). */
export function auditText(entries: readonly AuditEntry[], fmtWhen: (iso: string) => string): string {
  return [...entries]
    .sort((a, b) => b.at.localeCompare(a.at))
    .map((e) => {
      const head = `${fmtWhen(e.at)}  ${e.actor}  ${e.action.toUpperCase()}  ${e.collection}  ${e.label}`;
      return e.changes.length ? `${head}\n${e.changes.map((c) => `      · ${c}`).join('\n')}` : head;
    })
    .join('\n');
}
