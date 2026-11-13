/**
 * Modo nuvem: decide se o app usa o Supabase (variáveis VITE_SUPABASE_URL / VITE_SUPABASE_ANON_KEY)
 * e mantém o backend, a fila de envio e os repositórios remotos.
 */
import type { CloudBackend } from './backend';
import { SyncQueue } from './syncQueue';

const env = (import.meta as unknown as { env?: Record<string, string | undefined> }).env ?? {};
const URL_ = env.VITE_SUPABASE_URL?.trim();
const KEY = env.VITE_SUPABASE_ANON_KEY?.trim();
/** Somente testes automatizados: servidor simulado (ver devBackend.ts). */
const FAKE = env.VITE_FAKE_CLOUD_URL?.trim();

/** Endereço configurado (público), exibido no diagnóstico de erro de conexão. */
export const CLOUD_URL = FAKE ?? URL_ ?? '';

/** true quando o app está configurado para a nuvem. */
export const CLOUD: boolean = !!((URL_ && KEY) || FAKE);

let backend: CloudBackend | null = null;

/** Permite injetar um backend (testes) antes de qualquer uso. */
export function setCloudBackend(b: CloudBackend): void {
  backend = b;
}

export async function getCloudBackend(): Promise<CloudBackend> {
  if (!backend && FAKE) {
    const { createDevBackend } = await import('./devBackend');
    backend = createDevBackend(FAKE);
  }
  if (!backend) {
    if (!/^https?:\/\/[^/]+\/?$/.test(URL_ ?? '')) throw new Error(`VITE_SUPABASE_URL inválida: "${URL_ ?? ''}"`);
    const { createSupabaseBackend } = await import('./supabaseBackend');
    backend = createSupabaseBackend(URL_!.replace(/\/$/, ''), KEY!);
  }
  return backend;
}

/** Acesso síncrono (somente depois de `getCloudBackend()` ter sido aguardado no boot). */
export function cloudBackend(): CloudBackend {
  if (!backend) throw new Error('Cloud backend not initialized');
  return backend;
}

export const syncQueue = new SyncQueue(cloudBackend);

/** Rejeita se a operação não terminar no prazo (evita tela de carregamento infinita). */
export class TimeoutError extends Error {
  constructor(public seconds: number) {
    super(`timeout ${seconds}s`);
  }
}
export function withTimeout<T>(p: Promise<T>, seconds = 20): Promise<T> {
  return new Promise<T>((resolve, reject) => {
    const timer = setTimeout(() => reject(new TimeoutError(seconds)), seconds * 1000);
    p.then(
      (v) => (clearTimeout(timer), resolve(v)),
      (e: unknown) => (clearTimeout(timer), reject(e)),
    );
  });
}
