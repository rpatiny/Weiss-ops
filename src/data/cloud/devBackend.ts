/**
 * SOMENTE PARA TESTES AUTOMATIZADOS: backend que conversa com um servidor simulado
 * (scripts de teste) imitando Supabase Auth + RLS + Realtime. Ativado apenas quando
 * VITE_FAKE_CLOUD_URL está definido; nunca é usado em produção.
 */
import type { AuthSession, CloudBackend, PresenceInfo, ProfileRow, RecordRow, RemoteChange } from './backend';

const KEY = 'spindleops:fake-session';

export function createDevBackend(base: string): CloudBackend {
  const read = (): AuthSession | null => {
    try {
      return JSON.parse(localStorage.getItem(KEY) ?? 'null') as AuthSession | null;
    } catch {
      return null;
    }
  };
  const authListeners = new Set<(s: AuthSession | null) => void>();
  const call = async <T,>(path: string, init: RequestInit = {}): Promise<T> => {
    const s = read();
    const res = await fetch(base + path, { ...init, headers: { 'content-type': 'application/json', 'x-user': s?.userId ?? '' } });
    const body = (await res.json().catch(() => ({}))) as T & { error?: string };
    if (!res.ok) throw new Error(body.error ?? `HTTP ${res.status}`);
    return body;
  };
  return {
    async getSession() {
      return read();
    },
    async signIn(email, password) {
      try {
        const s = await call<AuthSession>('/auth/signin', { method: 'POST', body: JSON.stringify({ email, password }) });
        localStorage.setItem(KEY, JSON.stringify(s));
        return {};
      } catch (e) {
        return { error: (e as Error).message };
      }
    },
    async signUp(email, password, name) {
      try {
        const s = await call<AuthSession>('/auth/signup', { method: 'POST', body: JSON.stringify({ email, password, name }) });
        localStorage.setItem(KEY, JSON.stringify(s));
        return {};
      } catch (e) {
        return { error: (e as Error).message };
      }
    },
    async resetPassword() {
      return {};
    },
    async signOut() {
      localStorage.removeItem(KEY);
      authListeners.forEach((l) => l(null));
    },
    onAuthChange(cb) {
      authListeners.add(cb);
      return () => authListeners.delete(cb);
    },
    fetchProfiles: () => call<ProfileRow[]>('/profiles'),
    async updateProfile(id, patch) {
      await call(`/profiles/${id}`, { method: 'PATCH', body: JSON.stringify(patch) });
    },
    fetchAll: () => call<RecordRow[]>('/records'),
    async write(collection, upserts, deletes) {
      await call('/records/write', { method: 'POST', body: JSON.stringify({ collection, upserts, deletes }) });
    },
    subscribe(onChange, onStatus) {
      const es = new EventSource(`${base}/events?user=${read()?.userId ?? ''}`);
      es.onopen = () => onStatus?.(true);
      es.onerror = () => onStatus?.(false);
      es.onmessage = (m) => onChange(JSON.parse(m.data) as RemoteChange);
      return () => es.close();
    },
    presence(me, onSync) {
      // Servidor simulado: batimento a cada 2 s; a lista traz quem bateu nos últimos 6 s.
      const key = `${me.userId}:${Math.random().toString(36).slice(2, 10)}`;
      let current = me;
      const beat = () =>
        void call<PresenceInfo[]>('/presence', { method: 'POST', body: JSON.stringify({ key, info: current }) })
          .then(onSync)
          .catch(() => undefined);
      beat();
      const timer = setInterval(beat, 2000);
      return {
        update(next) {
          current = next;
          beat();
        },
        stop() {
          clearInterval(timer);
          void call('/presence', { method: 'POST', body: JSON.stringify({ key, leave: true }) }).catch(() => undefined);
        },
      };
    },
  };
}
