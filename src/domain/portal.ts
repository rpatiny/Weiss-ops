/**
 * Portal do cliente: contas de cliente, link por projeto, atualizações revisadas pelo Office e a visão segura do cliente.
 *
 * Regra de ouro: NADA vai automaticamente para o cliente. Toda atualização (avaliação/assessment, conclusão de fase com
 * fotos e horas, nota) nasce `pending`; o portal só mostra as `approved`. Até o andamento das fases que o cliente vê
 * vem das fases APROVADAS (não do apontamento de horas em tempo real).
 *
 * `buildPortalView` monta tudo o que o cliente pode ver (sem preços, POs, materiais, nomes de técnicos ou notas internas).
 * Na nuvem, é esta visão — e só ela — que deve ser publicada para o cliente (ver `supabase/customer-portal.sql`).
 */
import { assertCan, getCurrentUser } from '@/app/session';
import { repos } from '@/data/db';
import type { TranslationKey } from '@/i18n/types';
import { newId } from '@/lib/id';
import { sha256Hex } from '@/lib/sha256';
import type { CustomerAccount, Project, ProjectStatus, ProjectUpdate, ProjectUpdateKind, TimeEntry, WorkPhase } from '@/types/models';
import { activePhases, minutesByPhase, verifyClockPin } from './timeTracking';

// ───────────── Contas de cliente ─────────────

export const normName = (s: string) => s.trim().toLowerCase().replace(/\s+/g, ' ');
export const portalPinHash = (accountId: string, pin: string) => sha256Hex(new TextEncoder().encode(`spindleops:portal:${accountId}:${pin}`));
export const PORTAL_PIN_RE = /^\d{6}$/;
export const USERNAME_RE = /^[a-z0-9][a-z0-9._-]{2,31}$/;

/** Senha de 6 dígitos aleatória (crypto). */
export function generatePortalPin(): string {
  const a = new Uint32Array(1);
  crypto.getRandomValues(a);
  return String(a[0]! % 1_000_000).padStart(6, '0');
}

/** Token do link do projeto: 24 caracteres aleatórios (não adivinhável). */
export function generatePortalToken(): string {
  const bytes = new Uint8Array(18);
  crypto.getRandomValues(bytes);
  return btoa(String.fromCharCode(...bytes)).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}

export interface AccountDraft {
  /** Cliente do cadastro (o nome vem dele). */
  clientId?: string;
  name: string;
  username: string;
  email: string;
  active: boolean;
}

export function validateAccount(d: AccountDraft, all: readonly CustomerAccount[], selfId?: string): Partial<Record<keyof AccountDraft, TranslationKey>> {
  const e: Partial<Record<keyof AccountDraft, TranslationKey>> = {};
  if (!d.name.trim()) e.name = 'portal.validation.nameRequired';
  const u = d.username.trim().toLowerCase();
  if (!USERNAME_RE.test(u)) e.username = 'portal.validation.username';
  else if (all.some((a) => a.id !== selfId && a.username === u)) e.username = 'portal.validation.usernameTaken';
  if (d.email.trim() && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(d.email.trim())) e.email = 'portal.validation.email';
  return e;
}

export const accountService = {
  /** Cria a conta e devolve a senha gerada (mostrada UMA vez). */
  create(d: AccountDraft): { account: CustomerAccount; pin: string } {
    assertCan('customers.manage');
    const id = newId('cus');
    const pin = generatePortalPin();
    const account: CustomerAccount = {
      id,
      clientId: d.clientId,
      name: d.name.trim(),
      username: d.username.trim().toLowerCase(),
      email: d.email.trim() || undefined,
      active: d.active,
      pinHash: portalPinHash(id, pin),
      createdAt: new Date().toISOString(),
    };
    repos.customers.create(account);
    return { account, pin };
  },
  update(id: string, d: AccountDraft): void {
    assertCan('customers.manage');
    repos.customers.update(id, { name: d.name.trim(), username: d.username.trim().toLowerCase(), email: d.email.trim() || undefined, active: d.active });
  },
  /** Nova senha (a antiga deixa de valer). */
  resetPin(id: string): string {
    assertCan('customers.manage');
    const pin = generatePortalPin();
    repos.customers.update(id, { pinHash: portalPinHash(id, pin) });
    return pin;
  },
  remove(id: string): void {
    assertCan('customers.manage');
    repos.customers.remove(id);
  },
};

/** Contas que enxergam o projeto (mesmo nome de cliente). */
export const accountsForProject = (project: Pick<Project, 'customer' | 'clientId'>, accounts: readonly CustomerAccount[]) =>
  accounts.filter((a) => (project.clientId && a.clientId ? a.clientId === project.clientId : normName(a.name) === normName(project.customer)));

// ───────────── Link do projeto ─────────────

export const portalService = {
  enable(projectId: string): string {
    assertCan('portal.review');
    const token = generatePortalToken();
    repos.projects.update(projectId, { portalToken: token });
    return token;
  },
  /** Desliga o link (o antigo para de funcionar). */
  disable(projectId: string): void {
    assertCan('portal.review');
    repos.projects.update(projectId, { portalToken: undefined });
  },
};

/** Endereço do portal de um projeto. */
export const portalUrl = (token: string) => `${window.location.origin}${window.location.pathname}#/portal?p=${encodeURIComponent(token)}`;

// ───────────── Atualizações (sempre pendentes até o Office aprovar) ─────────────

export const MAX_UPDATE_PHOTOS = 8;

export const updateService = {
  /**
   * Shop floor (sem login, PIN do ponto): ao concluir uma fase gera a atualização com as horas da fase e as fotos/nota
   * opcionais. Fica pendente de revisão.
   */
  fromPhaseCompletion(employeeId: string, pin: string, entry: TimeEntry, photos: string[], note: string): ProjectUpdate | undefined {
    if (!verifyClockPin(employeeId, pin)) return undefined;
    const phase = repos.workPhases.getById(entry.phaseId);
    const minutes = minutesByPhase(entry.projectId, repos.timeEntries.getAll()).get(entry.phaseId) ?? 0;
    const u: ProjectUpdate = {
      id: newId('upd'),
      projectId: entry.projectId,
      kind: 'phase',
      title: phase?.name ?? '',
      text: note.trim(),
      photos: photos.slice(0, MAX_UPDATE_PHOTOS),
      phaseId: entry.phaseId,
      minutes: Math.round(minutes),
      showHours: true,
      createdAt: new Date().toISOString(),
      author: { kind: 'employee', id: employeeId },
      status: 'pending',
    };
    repos.projectUpdates.create(u);
    return u;
  },

  /** Office: avaliação (assessment) ou nota com fotos. Também nasce pendente (aprovação é um passo separado). */
  create(projectId: string, kind: Exclude<ProjectUpdateKind, 'phase'>, title: string, text: string, photos: string[]): ProjectUpdate {
    const user = assertCan('portal.review');
    const u: ProjectUpdate = {
      id: newId('upd'),
      projectId,
      kind,
      title: title.trim(),
      text: text.trim(),
      photos: photos.slice(0, MAX_UPDATE_PHOTOS),
      showHours: false,
      createdAt: new Date().toISOString(),
      author: { kind: 'user', id: user.id },
      status: 'pending',
    };
    repos.projectUpdates.create(u);
    return u;
  },

  /** Office edita antes de aprovar (título, texto, fotos mantidas, mostrar horas). */
  edit(id: string, patch: Partial<Pick<ProjectUpdate, 'title' | 'text' | 'photos' | 'showHours'>>): void {
    assertCan('portal.review');
    repos.projectUpdates.update(id, patch);
  },

  approve(id: string): void {
    const user = assertCan('portal.review');
    repos.projectUpdates.update(id, { status: 'approved', reviewedBy: user.id, reviewedAt: new Date().toISOString(), reviewNote: undefined });
  },

  reject(id: string, note: string): void {
    const user = assertCan('portal.review');
    repos.projectUpdates.update(id, { status: 'rejected', reviewedBy: user.id, reviewedAt: new Date().toISOString(), reviewNote: note.trim() || undefined });
  },

  /** Tira do portal / volta para revisão. */
  unpublish(id: string): void {
    assertCan('portal.review');
    repos.projectUpdates.update(id, { status: 'pending', reviewedBy: undefined, reviewedAt: undefined });
  },

  remove(id: string): void {
    assertCan('portal.review');
    repos.projectUpdates.remove(id);
  },
};

export const pendingUpdates = (list: readonly ProjectUpdate[]) => list.filter((u) => u.status === 'pending');

// ───────────── Login do cliente ─────────────

const MAX_ATTEMPTS = 5;
const LOCK_MS = 15 * 60_000;
const lockKey = (token: string) => `spindleops:portal-lock:${token}`;

function readLock(token: string): { fails: number; until: number } {
  try {
    return JSON.parse(localStorage.getItem(lockKey(token)) ?? '') as { fails: number; until: number };
  } catch {
    return { fails: 0, until: 0 };
  }
}
function writeLock(token: string, v: { fails: number; until: number }) {
  try {
    localStorage.setItem(lockKey(token), JSON.stringify(v));
  } catch {
    /* ignore */
  }
}

export type PortalLoginResult = { ok: true; account: CustomerAccount; project: Project } | { ok: false; error: TranslationKey; minutes?: number };

/**
 * Cliente entra com usuário + senha de 6 dígitos no link do projeto. Só passa se a conta estiver ativa e for do MESMO
 * cliente do projeto. 5 erros seguidos ⇒ bloqueio de 15 min (neste aparelho; na nuvem o bloqueio deve ser no servidor).
 */
export function portalLogin(token: string, username: string, pin: string, now = Date.now()): PortalLoginResult {
  const lock = readLock(token);
  if (lock.until > now) return { ok: false, error: 'portal.login.locked', minutes: Math.ceil((lock.until - now) / 60_000) };
  const project = repos.projects.getAll().find((p) => p.portalToken && p.portalToken === token);
  if (!project) return { ok: false, error: 'portal.login.invalidLink' };
  const account = repos.customers.getAll().find((a) => a.username === username.trim().toLowerCase());
  const sameClient = !!account && (project.clientId && account.clientId ? account.clientId === project.clientId : normName(account.name) === normName(project.customer));
  const ok = !!account && account.active && PORTAL_PIN_RE.test(pin) && portalPinHash(account.id, pin) === account.pinHash && sameClient;
  if (!ok) {
    const fails = lock.fails + 1;
    writeLock(token, fails >= MAX_ATTEMPTS ? { fails: 0, until: now + LOCK_MS } : { fails, until: 0 });
    return fails >= MAX_ATTEMPTS ? { ok: false, error: 'portal.login.locked', minutes: LOCK_MS / 60_000 } : { ok: false, error: 'portal.login.wrong' };
  }
  writeLock(token, { fails: 0, until: 0 });
  return { ok: true, account: account!, project };
}

// ───────────── O que o cliente vê ─────────────

export interface PortalPhase {
  id: string;
  name: string;
  done: boolean;
  /** Minutos (só se a atualização aprovada liberou as horas). */
  minutes?: number;
}

export type PortalUpdate = Pick<ProjectUpdate, 'id' | 'kind' | 'title' | 'text' | 'photos' | 'createdAt' | 'phaseId'> & { minutes?: number };

export interface PortalView {
  projectNumber: string;
  customer: string;
  description: string;
  status: ProjectStatus;
  phases: PortalPhase[];
  updates: PortalUpdate[];
  totalMinutes: number;
  lastUpdate?: string;
}

/**
 * Visão do cliente: SOMENTE atualizações aprovadas. Fase concluída = existe atualização de fase aprovada para ela.
 * Horas só quando o Office deixou `showHours` ligado.
 */
export function buildPortalView(project: Project, updates: readonly ProjectUpdate[], phases: readonly WorkPhase[]): PortalView {
  const approved = updates
    .filter((u) => u.projectId === project.id && u.status === 'approved')
    .sort((a, b) => a.createdAt.localeCompare(b.createdAt));
  const phaseMinutes = new Map<string, number>();
  const donePhases = new Set<string>();
  for (const u of approved) {
    if (u.kind !== 'phase' || !u.phaseId) continue;
    donePhases.add(u.phaseId);
    if (u.showHours && u.minutes) phaseMinutes.set(u.phaseId, u.minutes);
  }
  const list = activePhases(phases).map((p) => ({ id: p.id, name: p.name, done: donePhases.has(p.id), minutes: phaseMinutes.get(p.id) }));
  return {
    projectNumber: project.projectNumber,
    customer: project.customer,
    description: project.description,
    status: project.status,
    phases: list,
    updates: approved.map((u) => ({
      id: u.id,
      kind: u.kind,
      title: u.title,
      text: u.text,
      photos: u.photos,
      createdAt: u.createdAt,
      phaseId: u.phaseId,
      minutes: u.showHours ? u.minutes : undefined,
    })),
    totalMinutes: [...phaseMinutes.values()].reduce((s, m) => s + m, 0),
    lastUpdate: approved.at(-1)?.createdAt,
  };
}

/** Quem criou a atualização (nome interno — só para o Office, nunca vai para o cliente). */
export function updateAuthorName(u: ProjectUpdate): string {
  return u.author.kind === 'employee' ? (repos.employees.getById(u.author.id)?.name ?? '') : (repos.users.getById(u.author.id)?.name ?? getCurrentUser()?.name ?? '');
}
