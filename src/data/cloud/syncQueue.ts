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

export class SyncQueue {
  private pending = new Map<string, Pending>();
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
    if (typeof window !== 'undefined') window.addEventListener('online', () => this.schedule(0));
  }

  /** Registros com gravação pendente (eventos remotos desses ids são ignorados até confirmar). */
  isPending(collection: string, id: string): boolean {
    const p = this.pending.get(collection);
    return !!p && (p.upserts.has(id) || p.deletes.has(id));
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
    try {
      for (const [collection, p] of batch) {
        await this.backend().write(
          collection,
          [...p.upserts].map(([id, data]) => ({ id, data })),
          [...p.deletes],
        );
        batch.delete(collection);
      }
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
