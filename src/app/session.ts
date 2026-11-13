/**
 * Sessão local e permissões por perfil.
 *
 * ATENÇÃO: enquanto os dados ficam no navegador (localStorage), o PIN apenas separa
 * os perfis de uso no mesmo computador — não é segurança de servidor. Com um backend
 * compartilhado, a autenticação deve passar a ser feita por ele.
 */
import { useSyncExternalStore } from 'react';
import { repos } from '@/data/db';
import { APP_CONFIG } from '@/lib/config';
import type { User, UserRole } from '@/types/models';

export type Permission =
  | 'schedule.edit' // projetos, alocações, férias
  | 'employees.edit'
  | 'materials.edit' // materiais dos projetos
  | 'requisition.create'
  | 'requisition.process' // cotação, registrar PO do SAP, rejeitar
  | 'po.edit'
  | 'gr.register'
  | 'catalog.edit' // catálogo e cotações
  | 'suppliers.edit'
  | 'financial.edit' // spindles, cotações, faturamento e forecast
  | 'extension.request' // pedir extensão de material no SAP
  | 'extension.process' // executar/concluir a extensão
  | 'data.manage' // reset/limpar/backup
  | 'users.manage';

const ROLE_PERMISSIONS: Record<UserRole, readonly Permission[]> = {
  master: [
    'schedule.edit', 'employees.edit', 'materials.edit', 'requisition.create', 'requisition.process',
    'po.edit', 'gr.register', 'catalog.edit', 'suppliers.edit', 'extension.request', 'extension.process', 'financial.edit', 'data.manage', 'users.manage',
  ],
  office: ['schedule.edit', 'employees.edit', 'materials.edit', 'requisition.create', 'extension.request', 'financial.edit'],
  logistics: ['requisition.process', 'po.edit', 'gr.register', 'catalog.edit', 'suppliers.edit', 'extension.request', 'extension.process'],
};

const KEY = `${APP_CONFIG.storagePrefix}:session`;
const listeners = new Set<() => void>();
let currentId: string | null = (() => {
  try {
    return localStorage.getItem(KEY);
  } catch {
    return null;
  }
})();

function emit() {
  listeners.forEach((l) => l());
}

export function getCurrentUser(): User | undefined {
  const u = currentId ? repos.users.getById(currentId) : undefined;
  return u?.active && !u.pending ? u : undefined;
}

export function can(permission: Permission, user: User | undefined = getCurrentUser()): boolean {
  return !!user && ROLE_PERMISSIONS[user.role].includes(permission);
}

/** Guarda nos serviços de domínio: impede a ação mesmo que a UI falhe em escondê-la. */
export function assertCan(permission: Permission): User {
  const user = getCurrentUser();
  if (!user || !can(permission, user)) throw new Error('auth.forbidden');
  return user;
}

export const currentUserId = () => getCurrentUser()?.id ?? 'system';

// ───────── PIN ─────────

export async function hashPin(userId: string, pin: string): Promise<string> {
  const data = new TextEncoder().encode(`spindleops:${userId}:${pin}`);
  if (globalThis.crypto?.subtle) {
    const buf = await crypto.subtle.digest('SHA-256', data);
    return [...new Uint8Array(buf)].map((b) => b.toString(16).padStart(2, '0')).join('');
  }
  return sha256Fallback(data);
}

export async function login(userId: string, pin: string): Promise<boolean> {
  const user = repos.users.getById(userId);
  if (!user?.active) return false;
  if ((await hashPin(userId, pin)) !== user.pinHash) return false;
  currentId = userId;
  try {
    localStorage.setItem(KEY, userId);
  } catch {
    /* ignore */
  }
  emit();
  return true;
}

/** Modo nuvem: define o usuário (conta do Supabase) depois do login e da carga dos dados. */
export function setSessionUser(id: string | null): void {
  currentId = id;
  emit();
}

let cloudSignOut: (() => Promise<void>) | null = null;
/** Modo nuvem: registra como encerrar a sessão no Supabase. */
export function setCloudSignOut(fn: () => Promise<void>): void {
  cloudSignOut = fn;
}

export function logout(): void {
  if (cloudSignOut) {
    void cloudSignOut().finally(() => window.location.reload());
    return;
  }
  currentId = null;
  try {
    localStorage.removeItem(KEY);
  } catch {
    /* ignore */
  }
  emit();
}

function subscribe(cb: () => void) {
  listeners.add(cb);
  const unsub = repos.users.subscribe(cb);
  return () => {
    listeners.delete(cb);
    unsub();
  };
}

/** Usuário logado (re-renderiza ao logar/sair ou quando o cadastro muda). */
export function useCurrentUser(): User | undefined {
  return useSyncExternalStore(subscribe, getCurrentUser, getCurrentUser);
}

/** `const allowed = useCan(); allowed('po.edit')` */
export function useCan(): (p: Permission) => boolean {
  const user = useCurrentUser();
  return (p) => can(p, user);
}

// SHA-256 em JS puro (contextos sem crypto.subtle, ex.: arquivo local).
function sha256Fallback(bytes: Uint8Array): string {
  const K = new Uint32Array([
    0x428a2f98, 0x71374491, 0xb5c0fbcf, 0xe9b5dba5, 0x3956c25b, 0x59f111f1, 0x923f82a4, 0xab1c5ed5, 0xd807aa98, 0x12835b01, 0x243185be, 0x550c7dc3,
    0x72be5d74, 0x80deb1fe, 0x9bdc06a7, 0xc19bf174, 0xe49b69c1, 0xefbe4786, 0x0fc19dc6, 0x240ca1cc, 0x2de92c6f, 0x4a7484aa, 0x5cb0a9dc, 0x76f988da,
    0x983e5152, 0xa831c66d, 0xb00327c8, 0xbf597fc7, 0xc6e00bf3, 0xd5a79147, 0x06ca6351, 0x14292967, 0x27b70a85, 0x2e1b2138, 0x4d2c6dfc, 0x53380d13,
    0x650a7354, 0x766a0abb, 0x81c2c92e, 0x92722c85, 0xa2bfe8a1, 0xa81a664b, 0xc24b8b70, 0xc76c51a3, 0xd192e819, 0xd6990624, 0xf40e3585, 0x106aa070,
    0x19a4c116, 0x1e376c08, 0x2748774c, 0x34b0bcb5, 0x391c0cb3, 0x4ed8aa4a, 0x5b9cca4f, 0x682e6ff3, 0x748f82ee, 0x78a5636f, 0x84c87814, 0x8cc70208,
    0x90befffa, 0xa4506ceb, 0xbef9a3f7, 0xc67178f2,
  ]);
  const H = new Uint32Array([0x6a09e667, 0xbb67ae85, 0x3c6ef372, 0xa54ff53a, 0x510e527f, 0x9b05688c, 0x1f83d9ab, 0x5be0cd19]);
  const len = bytes.length;
  const padded = new Uint8Array(((len + 9 + 63) >> 6) << 6);
  padded.set(bytes);
  padded[len] = 0x80;
  const view = new DataView(padded.buffer);
  view.setUint32(padded.length - 4, len * 8);
  view.setUint32(padded.length - 8, Math.floor((len * 8) / 2 ** 32));
  const W = new Uint32Array(64);
  const rotr = (x: number, n: number) => (x >>> n) | (x << (32 - n));
  for (let off = 0; off < padded.length; off += 64) {
    for (let i = 0; i < 16; i++) W[i] = view.getUint32(off + i * 4);
    for (let i = 16; i < 64; i++) {
      const w15 = W[i - 15]!;
      const w2 = W[i - 2]!;
      const s0 = rotr(w15, 7) ^ rotr(w15, 18) ^ (w15 >>> 3);
      const s1 = rotr(w2, 17) ^ rotr(w2, 19) ^ (w2 >>> 10);
      W[i] = (W[i - 16]! + s0 + W[i - 7]! + s1) >>> 0;
    }
    let [a, b, c, d, e, f, g, h] = [H[0]!, H[1]!, H[2]!, H[3]!, H[4]!, H[5]!, H[6]!, H[7]!];
    for (let i = 0; i < 64; i++) {
      const S1 = rotr(e, 6) ^ rotr(e, 11) ^ rotr(e, 25);
      const ch = (e & f) ^ (~e & g);
      const t1 = (h + S1 + ch + K[i]! + W[i]!) >>> 0;
      const S0 = rotr(a, 2) ^ rotr(a, 13) ^ rotr(a, 22);
      const maj = (a & b) ^ (a & c) ^ (b & c);
      const t2 = (S0 + maj) >>> 0;
      h = g;
      g = f;
      f = e;
      e = (d + t1) >>> 0;
      d = c;
      c = b;
      b = a;
      a = (t1 + t2) >>> 0;
    }
    H[0] = (H[0]! + a) >>> 0;
    H[1] = (H[1]! + b) >>> 0;
    H[2] = (H[2]! + c) >>> 0;
    H[3] = (H[3]! + d) >>> 0;
    H[4] = (H[4]! + e) >>> 0;
    H[5] = (H[5]! + f) >>> 0;
    H[6] = (H[6]! + g) >>> 0;
    H[7] = (H[7]! + h) >>> 0;
  }
  return [...H].map((x) => x.toString(16).padStart(8, '0')).join('');
}
