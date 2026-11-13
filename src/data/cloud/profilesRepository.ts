import type { User, UserRole } from '@/types/models';
import type { Repository } from '../repository';
import type { CloudBackend, ProfileRow } from './backend';

type Listener = () => void;

export const profileToUser = (p: ProfileRow): User => ({
  id: p.id,
  name: p.name || p.email,
  email: p.email,
  role: (p.role === 'pending' ? 'office' : p.role) as UserRole,
  active: p.active,
  pending: p.role === 'pending',
  pinHash: '',
});

/**
 * Usuários no modo nuvem = tabela `profiles` (contas do Supabase Auth).
 * Contas são criadas pelo cadastro na tela de login; aqui só se altera nome, perfil e ativo (Master, via RLS).
 */
export class ProfilesRepository implements Repository<User> {
  private cache: readonly User[] = Object.freeze([]);
  private listeners = new Set<Listener>();
  onError: (msg: string) => void = () => {};

  constructor(private backend: () => CloudBackend) {}

  private set(next: User[]) {
    this.cache = Object.freeze(next);
    this.listeners.forEach((l) => l());
  }

  hydrate(rows: ProfileRow[]) {
    this.set(rows.map(profileToUser));
  }

  applyRemote(c: { type: 'upsert'; profile: ProfileRow } | { type: 'delete'; id: string }) {
    if (c.type === 'delete') return this.set(this.cache.filter((u) => u.id !== c.id));
    const u = profileToUser(c.profile);
    this.set(this.cache.some((x) => x.id === u.id) ? this.cache.map((x) => (x.id === u.id ? u : x)) : [...this.cache, u]);
  }

  getAll = (): readonly User[] => this.cache;
  getById(id: string) {
    return this.cache.find((u) => u.id === id);
  }
  create(): User {
    throw new Error('cloud.users.createViaSignup');
  }
  update(id: string, patch: Partial<Omit<User, 'id'>>): User {
    const cur = this.getById(id);
    if (!cur) throw new Error(`Usuário não encontrado: ${id}`);
    const next = { ...cur, ...patch, pending: patch.role ? false : cur.pending };
    this.set(this.cache.map((u) => (u.id === id ? next : u)));
    void this.backend()
      .updateProfile(id, { name: next.name, role: next.role, active: next.active })
      .catch((e: Error) => this.onError(e.message));
    return next;
  }
  upsert(item: User): User {
    return this.update(item.id, item);
  }
  remove(id: string): void {
    this.update(id, { active: false });
  }
  /** Backups não substituem contas de login no modo nuvem. */
  replaceAll(): void {}
  subscribe = (l: Listener) => {
    this.listeners.add(l);
    return () => this.listeners.delete(l);
  };
}
