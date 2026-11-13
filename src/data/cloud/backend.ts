/**
 * Contrato do backend na nuvem. A implementação real é `supabaseBackend.ts`; os testes usam
 * uma versão em memória. Nada fora de `src/data/cloud` conhece o Supabase diretamente.
 */
export interface RecordRow {
  collection: string;
  id: string;
  data: unknown;
}

export type RemoteChange =
  | { table: 'records'; type: 'upsert'; row: RecordRow }
  | { table: 'records'; type: 'delete'; collection: string; id: string }
  | { table: 'profiles'; type: 'upsert'; profile: ProfileRow }
  | { table: 'profiles'; type: 'delete'; id: string };

export type ProfileRole = 'pending' | 'master' | 'logistics' | 'office';

export interface ProfileRow {
  id: string;
  email: string;
  name: string;
  role: ProfileRole;
  active: boolean;
}

export interface AuthSession {
  userId: string;
  email: string;
}

export interface CloudBackend {
  // Autenticação
  getSession(): Promise<AuthSession | null>;
  signIn(email: string, password: string): Promise<{ error?: string }>;
  signUp(email: string, password: string, name: string): Promise<{ error?: string; needsConfirmation?: boolean }>;
  resetPassword(email: string): Promise<{ error?: string }>;
  signOut(): Promise<void>;
  onAuthChange(cb: (session: AuthSession | null) => void): () => void;
  // Dados
  fetchProfiles(): Promise<ProfileRow[]>;
  updateProfile(id: string, patch: Partial<Omit<ProfileRow, 'id' | 'email'>>): Promise<void>;
  fetchAll(): Promise<RecordRow[]>;
  write(collection: string, upserts: { id: string; data: unknown }[], deletes: string[]): Promise<void>;
  subscribe(onChange: (c: RemoteChange) => void, onStatus?: (connected: boolean) => void): () => void;
}
