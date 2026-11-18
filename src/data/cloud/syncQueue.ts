/**
 * Fila de gravação para a nuvem: junta alterações (última versão de cada registro vence),
 * envia em lote com pequeno atraso, tenta de novo com espera crescente se falhar
 * (ex.: sem internet) e expõe o status para a interface.
 */
import type { CloudBackend } from './backend';

export type SyncState = 'synced' | 'saving' | 'offline' | 'error';

interface Pending {
  upserts: Map<string, unknown>;
  deletes: Set<string>;
}

type Listener = () => void;

/** Fila guardada no aparelho: se a página fechar (celular bloqueado, aba fechada) antes do envio, nada se perde. */
const STORE_KEY = 'spindleops:cloud-pending';
type Stored = Record<string, { upserts: [string, unknown][]; deletes: string[] }>;

export class SyncQueue {
  private pending = new Map<string, Pending>();
  private inFlight = new Map<string, Pending>();
  private timer: ReturnType<typeof setTimeout> | null = null;
  private flushing = false;
  private retryMs = 0;
  private listeners = new Set<Listener>();
  state: SyncState = 'synced';
  lastError = '';

  constructor(
    private backend: () => CloudBackend,
    private delayMs = 250,
  ) {
    this.restore();
    if (typeof window !== 'undefined') {
      window.addEventListener('online', () => this.schedule(0));
      // Saindo da tela (bloqueou o celular, trocou de app, fechou a aba): tenta enviar já.
      const now = () => {
        if (this.size) void this.flush();
      };
      window.addEventListener('pagehide', now);
      document.addEventListener('visibilitychange', () => document.visibilityState === 'hidden' && now());
    }
  }

  private persist() {
    try {
      const all = new Map<string, Pending>();
      // O lote em envio também conta (só sai do aparelho depois de confirmado).
      for (const src of [this.inFlight, this.pending]) {
        for (const [c, p] of src) {
          const cur = all.get(c) ?? { upserts: new Map(), deletes: new Set() };
          for (const [id, d] of p.upserts) { cur.deletes.delete(id); cur.upserts.set(id, d); }
          for (const id of p.deletes) { cur.upserts.delete(id); cur.deletes.add(id); }
          all.set(c, cur);
        }
      }
      const out: Stored = {};
      for (const [c, p] of all) if (p.upserts.size || p.deletes.size) out[c] = { upserts: [...p.upserts], deletes: [...p.deletes] };
      if (Object.keys(out).length) localStorage.setItem(STORE_KEY, JSON.stringify(out));
      else localStorage.removeItem(STORE_KEY);
    } catch {
      /* sem armazenamento: segue só em memória */
    }
  }

  private restore() {
    try {
      const raw = typeof localStorage !== 'undefined' ? localStorage.getItem(STORE_KEY) : null;
      if (!raw) return;
      for (const [c, p] of Object.entries(JSON.parse(raw) as Stored)) this.pending.set(c, { upserts: new Map(p.upserts), deletes: new Set(p.deletes) });
      if (this.size) this.state = 'saving';
    } catch {
      /* ignora fila corrompida */
    }
  }

  /** Alterações ainda não confirmadas pelo servidor (reaplicadas no cache depois de recarregar da nuvem). */
  pendingChanges(): { collection: string; upserts: { id: string; data: unknown }[]; deletes: string[] }[] {
    const out = new Map<string, { upserts: Map<string, unknown>; deletes: Set<string> }>();
    for (const src of [this.inFlight, this.pending])
      for (const [c, p] of src) {
        const cur = out.get(c) ?? { upserts: new Map(), deletes: new Set() };
        for (const [id, d] of p.upserts) { cur.deletes.delete(id); cur.upserts.set(id, d); }
        for (const id of p.deletes) { cur.upserts.delete(id); cur.deletes.add(id); }
        out.set(c, cur);
      }
    return [...out].map(([collection, p]) => ({ collection, upserts: [...p.upserts].map(([id, data]) => ({ id, data })), deletes: [...p.deletes] }));
  }

  /** Começa a enviar o que ficou guardado no aparelho (chamado depois que o backend conectou). */
  resume() {
    if (this.size) this.schedule(0);
  }

  /** Registros com gravação pendente (eventos remotos desses ids são ignorados até confirmar). */
  isPending(collection: string, id: string): boolean {
    return [this.pending, this.inFlight].some((m) => {
      const p = m.get(collection);
      return !!p && (p.upserts.has(id) || p.deletes.has(id));
    });
  }

  get size(): number {
    let n = 0;
    for (const p of this.pending.values()) n += p.upserts.size + p.deletes.size;
    return n;
  }

  enqueue(collection: string, upserts: { id: string; data: unknown }[], deletes: string[]): void {
    if (!upserts.length && !deletes.length) return;
    const p = this.pending.get(collection) ?? { upserts: new Map(), deletes: new Set() };
    for (const u of upserts) {
      p.deletes.delete(u.id);
      p.upserts.set(u.id, u.data);
    }
    for (const id of deletes) {
      p.upserts.delete(id);
      p.deletes.add(id);
    }
    this.pending.set(collection, p);
    this.persist();
    this.setState('saving');
    this.schedule(this.delayMs);
  }

  /** Aguarda esvaziar a fila (usado em testes e antes de sair). */
  async drain(timeoutMs = 10_000): Promise<boolean> {
    const start = Date.now();
    while (this.size > 0 || this.flushing) {
      if (Date.now() - start > timeoutMs) return false;
      await new Promise((r) => setTimeout(r, 20));
    }
    return true;
  }

  subscribe(l: Listener): () => void {
    this.listeners.add(l);
    return () => this.listeners.delete(l);
  }

  private setState(s: SyncState, err = '') {
    this.state = s;
    this.lastError = err;
    this.listeners.forEach((l) => l());
  }

  private schedule(ms: number) {
    if (this.timer) clearTimeout(this.timer);
    this.timer = setTimeout(() => void this.flush(), ms);
  }

  private async flush(): Promise<void> {
    if (this.flushing || this.size === 0) return;
    this.flushing = true;
    // Retira um "instantâneo" do que será enviado; alterações novas entram em outro lote.
    const batch = this.pending;
    this.pending = new Map();
    this.inFlight = batch;
    try {
      for (const [collection, p] of batch) {
        await this.backend().write(
          collection,
          [...p.upserts].map(([id, data]) => ({ id, data })),
          [...p.deletes],
        );
        batch.delete(collection);
        this.persist();
      }
      this.inFlight = new Map();
      this.persist();
      this.retryMs = 0;
      this.setState(this.size ? 'saving' : 'synced');
    } catch (e) {
      // Devolve o que não foi enviado para a fila, sem sobrescrever alterações mais novas.
      for (const [collection, p] of batch) {
        const cur = this.pending.get(collection) ?? { upserts: new Map(), deletes: new Set() };
        for (const [id, data] of p.upserts) if (!cur.upserts.has(id) && !cur.deletes.has(id)) cur.upserts.set(id, data);
        for (const id of p.deletes) if (!cur.upserts.has(id)) cur.deletes.add(id);
        this.pending.set(collection, cur);
      }
      this.inFlight = new Map();
      this.persist();
      const offline = typeof navigator !== 'undefined' && navigator.onLine === false;
      this.setState(offline ? 'offline' : 'error', (e as Error).message);
      this.retryMs = Math.min(30_000, this.retryMs ? this.retryMs * 2 : 1000);
      this.schedule(this.retryMs);
    } finally {
      this.flushing = false;
      if (this.size && this.state === 'saving') this.schedule(this.delayMs);
    }
  }
}
