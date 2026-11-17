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

/**
 * Sessão com validade (antes ficava gravada para sempre e o app abria sem login):
 * expira após IDLE_MS sem uso ou MAX_MS desde o login. Gravada como `{ userId, startedAt, lastActive }`;
 * o formato antigo (só o id) não vale mais ⇒ pede login.
 */
const KEY = `${APP_CONFIG.storagePrefix}:session.v2`;
const LEGACY_KEY = `${APP_CONFIG.storagePrefix}:session`;
export const SESSION_IDLE_MS = 30 * 60 * 1000;
export const SESSION_MAX_MS = 12 * 60 * 60 * 1000;

interface StoredSession {
  userId: string;
  startedAt: number;
  lastActive: number;
}

const isValid = (x: StoredSession | null, now = Date.now()): x is StoredSession =>
  !!x && typeof x.userId === 'string' && now - x.lastActive < SESSION_IDLE_MS && now - x.startedAt < SESSION_MAX_MS && x.lastActive <= now + 60_000;

function readStored(): StoredSession | null {
  try {
    const raw = localStorage.getItem(KEY);
    return raw ? (JSON.parse(raw) as StoredSession) : null;
  } catch {
    return null;
  }
}

function writeStored(x: StoredSession | null) {
  try {
    if (x) localStorage.setItem(KEY, JSON.stringify(x));
    else localStorage.removeItem(KEY);
  } catch {
    /* ignore */
  }
}

/** Sessão local (PIN). Modo e-mail: a sessão é do Supabase (`setSessionUser`). */
let stored: StoredSession | null = (() => {
  try {
    localStorage.removeItem(LEGACY_KEY);
  } catch {
    /* ignore */
  }
  const x = readStored();
  if (isValid(x)) return x;
  writeStored(null);
  return null;
})();
let currentId: string | null = stored?.userId ?? null;
const listeners = new Set<() => void>();

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
  const now = Date.now();
  stored = { userId, startedAt: now, lastActive: now };
  writeStored(stored);
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
  stored = null;
  writeStored(null);
  emit();
}

// ───────── Validade da sessão (PIN) ─────────

let lastTouch = 0;
/** Uso do app renova o prazo de inatividade (no máx. 1 gravação a cada 15 s). */
function touch() {
  if (!stored) return;
  const now = Date.now();
  if (now - lastTouch < 15_000) return;
  lastTouch = now;
  // Outra aba pode ter saído/entrado com outro usuário: respeita o que está gravado.
  const disk = readStored();
  if (!disk || disk.userId !== stored.userId || disk.startedAt !== stored.startedAt) return checkSession();
  if (!isValid(stored, now)) return checkSession();
  stored = { ...stored, lastActive: now };
  writeStored(stored);
}

/** Encerra a sessão vencida (ou encerrada em outra aba). */
function checkSession() {
  if (!stored) return;
  const disk = readStored();
  const now = Date.now();
  // Atividade em outra aba conta (mesma sessão, lastActive mais recente).
  if (disk && disk.userId === stored.userId && disk.startedAt === stored.startedAt && disk.lastActive > stored.lastActive) stored = disk;
  const same = !!disk && disk.userId === stored.userId && disk.startedAt === stored.startedAt;
  if (!same || !isValid(stored, now)) logout();
}

if (typeof window !== 'undefined') {
  for (const ev of ['pointerdown', 'keydown', 'wheel', 'touchstart'] as const) window.addEventListener(ev, touch, { passive: true, capture: true });
  // Ao voltar para a aba/app (ex.: celular desbloqueado depois de horas), confere antes de mostrar os dados.
  document.addEventListener('visibilitychange', () => document.visibilityState === 'visible' && checkSession());
  window.addEventListener('pageshow', checkSession);
  window.addEventListener('storage', (e) => e.key === KEY && checkSession());
  setInterval(checkSession, 30_000);
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
