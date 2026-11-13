import { createClient, type SupabaseClient } from '@supabase/supabase-js';
import type { AuthSession, CloudBackend, ProfileRow, RecordRow } from './backend';

const PAGE = 1000;
const CHUNK = 500;

/** Backend real (Supabase: Auth + Postgres + Realtime). */
export function createSupabaseBackend(url: string, anonKey: string): CloudBackend {
  const sb: SupabaseClient = createClient(url, anonKey, { auth: { persistSession: true, autoRefreshToken: true } });
  const toSession = (s: { user: { id: string; email?: string } } | null): AuthSession | null => (s ? { userId: s.user.id, email: s.user.email ?? '' } : null);

  return {
    async getSession() {
      const { data } = await sb.auth.getSession();
      return toSession(data.session);
    },
    async signIn(email, password) {
      const { error } = await sb.auth.signInWithPassword({ email, password });
      return { error: error?.message };
    },
    async signUp(email, password, name) {
      const { data, error } = await sb.auth.signUp({ email, password, options: { data: { name }, emailRedirectTo: window.location.origin } });
      return { error: error?.message, needsConfirmation: !error && !data.session };
    },
    async resetPassword(email) {
      const { error } = await sb.auth.resetPasswordForEmail(email, { redirectTo: window.location.origin });
      return { error: error?.message };
    },
    async signOut() {
      await sb.auth.signOut();
    },
    onAuthChange(cb) {
      const { data } = sb.auth.onAuthStateChange((_e, s) => cb(toSession(s)));
      return () => data.subscription.unsubscribe();
    },
    async fetchProfiles() {
      const { data, error } = await sb.from('profiles').select('id,email,name,role,active').order('created_at');
      if (error) throw new Error(error.message);
      return (data ?? []) as ProfileRow[];
    },
    async updateProfile(id, patch) {
      const { error } = await sb.from('profiles').update(patch).eq('id', id);
      if (error) throw new Error(error.message);
    },
    async fetchAll() {
      const out: RecordRow[] = [];
      for (let from = 0; ; from += PAGE) {
        const { data, error } = await sb.from('records').select('collection,id,data').order('collection').order('id').range(from, from + PAGE - 1);
        if (error) throw new Error(error.message);
        out.push(...((data ?? []) as RecordRow[]));
        if (!data || data.length < PAGE) break;
      }
      return out;
    },
    async write(collection, upserts, deletes) {
      for (let i = 0; i < upserts.length; i += CHUNK) {
        const rows = upserts.slice(i, i + CHUNK).map((u) => ({ collection, id: u.id, data: u.data }));
        const { error } = await sb.from('records').upsert(rows, { onConflict: 'collection,id' });
        if (error) throw new Error(error.message);
      }
      for (let i = 0; i < deletes.length; i += CHUNK) {
        const { error } = await sb.from('records').delete().eq('collection', collection).in('id', deletes.slice(i, i + CHUNK));
        if (error) throw new Error(error.message);
      }
    },
    subscribe(onChange, onStatus) {
      const ch = sb
        .channel('spindleops-sync')
        .on('postgres_changes', { event: '*', schema: 'public', table: 'records' }, (p) => {
          if (p.eventType === 'DELETE') {
            const old = p.old as { collection?: string; id?: string };
            if (old.collection && old.id) onChange({ table: 'records', type: 'delete', collection: old.collection, id: old.id });
          } else onChange({ table: 'records', type: 'upsert', row: p.new as RecordRow });
        })
        .on('postgres_changes', { event: '*', schema: 'public', table: 'profiles' }, (p) => {
          if (p.eventType === 'DELETE') onChange({ table: 'profiles', type: 'delete', id: (p.old as { id: string }).id });
          else onChange({ table: 'profiles', type: 'upsert', profile: p.new as ProfileRow });
        })
        .subscribe((status) => onStatus?.(status === 'SUBSCRIBED'));
      return () => {
        void sb.removeChannel(ch);
      };
    },
  };
}
