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
import { sha256Hex } from '@/lib/sha256';
import type { User, UserRole } from '@/types/models';

export type Permission =
  | 'schedule.edit' // projetos, alocações, férias
  | 'employees.edit'
  | 'time.manage' // horas da oficina: corrigir/lançar apontamentos, fases, PIN do ponto
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
    'schedule.edit', 'employees.edit', 'time.manage', 'materials.edit', 'requisition.create', 'requisition.process',
    'po.edit', 'gr.register', 'catalog.edit', 'suppliers.edit', 'extension.request', 'extension.process', 'financial.edit', 'data.manage', 'users.manage',
  ],
  office: ['schedule.edit', 'employees.edit', 'time.manage', 'materials.edit', 'requisition.create', 'extension.request', 'financial.edit'],
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
  return sha256Hex(data);
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
