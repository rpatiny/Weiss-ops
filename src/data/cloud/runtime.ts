/**
 * Modo nuvem: decide se o app usa o Supabase (variáveis VITE_SUPABASE_URL / VITE_SUPABASE_ANON_KEY)
 * e mantém o backend, a fila de envio e os repositórios remotos.
 */
import type { CloudBackend } from './backend';
import { SyncQueue } from './syncQueue';

const env = (import.meta as unknown as { env?: Record<string, string | undefined> }).env ?? {};
/** Remove espaços e aspas coladas junto com o valor na Vercel. */
const clean = (v?: string) => v?.trim().replace(/^["'`]+|["'`]+$/g, '').trim() || undefined;

/**
 * Aceita os formatos que costumam ser colados por engano e devolve a Project URL
 * (`https://<ref>.supabase.co`): sem `https://`, com `/rest/v1` no fim ou o endereço do painel
 * (`supabase.com/dashboard/project/<ref>`).
 */
export function normalizeSupabaseUrl(raw?: string): string | undefined {
  let v = clean(raw);
  if (!v) return undefined;
  if (!/^https?:\/\//i.test(v)) v = `https://${v}`;
  try {
    const u = new URL(v);
    const dash = /\/project\/([a-z0-9]{10,})/i.exec(u.pathname);
    if (/(^|\.)supabase\.com$/i.test(u.hostname) && dash) return `https://${dash[1]!.toLowerCase()}.supabase.co`;
    return `${u.protocol}//${u.host}`;
  } catch {
    return v;
  }
}

const URL_ = normalizeSupabaseUrl(env.VITE_SUPABASE_URL);
const KEY = clean(env.VITE_SUPABASE_ANON_KEY);
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
    if (!/^https?:\/\/[^/\s]+$/.test(URL_ ?? '')) throw new Error(`VITE_SUPABASE_URL inválida: "${env.VITE_SUPABASE_URL ?? ''}"`);
    const { createSupabaseBackend } = await import('./supabaseBackend');
    backend = createSupabaseBackend(URL_!, KEY!);
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
