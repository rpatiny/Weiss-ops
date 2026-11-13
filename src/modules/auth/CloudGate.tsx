import { useCallback, useEffect, useState, type FormEvent, type ReactNode } from 'react';
import { Clock, Cog, KeyRound, Loader2, LogIn, LogOut, Mail, RefreshCw, UserPlus } from 'lucide-react';
import { setCloudSignOut, setSessionUser } from '@/app/session';
import { Button } from '@/components/ui/Button';
import { Input } from '@/components/ui/Field';
import type { AuthSession, ProfileRow } from '@/data/cloud/backend';
import { connectCloud, disconnectCloud } from '@/data/cloud/connect';
import { getCloudBackend } from '@/data/cloud/runtime';
import { LOCALES, useI18n } from '@/i18n';
import { APP_CONFIG } from '@/lib/config';
import { cn } from '@/lib/cn';
import { DisclaimerStrip } from '@/components/layout/Disclaimer';

type Phase =
  | { kind: 'checking' }
  | { kind: 'signedOut' }
  | { kind: 'blocked'; session: AuthSession; profile?: ProfileRow }
  | { kind: 'loading' }
  | { kind: 'error'; message: string }
  | { kind: 'ready' };

/**
 * Modo nuvem: só libera o app depois de (1) login no Supabase, (2) perfil liberado pelo Master
 * e (3) carga dos dados da equipe. Também conecta o tempo real.
 */
export function CloudGate({ children }: { children: ReactNode }) {
  const { t } = useI18n();
  const [phase, setPhase] = useState<Phase>({ kind: 'checking' });

  const enter = useCallback(async (session: AuthSession | null) => {
    if (!session) {
      disconnectCloud();
      setSessionUser(null);
      return setPhase({ kind: 'signedOut' });
    }
    setPhase({ kind: 'loading' });
    try {
      const b = await getCloudBackend();
      const me = (await b.fetchProfiles()).find((p) => p.id === session.userId);
      if (!me || me.role === 'pending' || !me.active) return setPhase({ kind: 'blocked', session, profile: me });
      await connectCloud();
      setSessionUser(session.userId);
      setPhase({ kind: 'ready' });
    } catch (e) {
      setPhase({ kind: 'error', message: (e as Error).message });
    }
  }, []);

  useEffect(() => {
    let unsub = () => {};
    void getCloudBackend().then(async (b) => {
      setCloudSignOut(() => b.signOut());
      await enter(await b.getSession());
      unsub = b.onAuthChange((s) => {
        if (!s) void enter(null);
      });
    });
    return () => unsub();
  }, [enter]);

  if (phase.kind === 'ready') return <>{children}</>;

  return (
    <Shell>
      {phase.kind === 'checking' || phase.kind === 'loading' ? (
        <div className="card flex flex-col items-center gap-3 p-8 text-center">
          <Loader2 className="size-8 animate-spin text-brand-500" />
          <p className="text-sm text-slate-500">{t('cloud.loading')}</p>
        </div>
      ) : phase.kind === 'error' ? (
        <div className="card space-y-4 p-6">
          <p role="alert" className="text-sm text-red-600">
            {t('cloud.loadError', { error: phase.message })}
          </p>
          <div className="flex gap-2">
            <Button variant="primary" icon={RefreshCw} onClick={() => void getCloudBackend().then(async (b) => enter(await b.getSession()))}>
              {t('cloud.retry')}
            </Button>
            <Button icon={LogOut} onClick={() => void getCloudBackend().then((b) => b.signOut()).then(() => enter(null))}>
              {t('cloud.logout')}
            </Button>
          </div>
        </div>
      ) : phase.kind === 'blocked' ? (
        <div className="card space-y-4 p-6">
          <h1 className="flex items-center gap-2 text-lg font-semibold text-slate-900 dark:text-white">
            <Clock className="size-5 text-amber-500" /> {t('cloud.pendingTitle')}
          </h1>
          <p className="text-sm text-slate-600 dark:text-slate-300">
            {phase.profile && !phase.profile.active && phase.profile.role !== 'pending' ? t('cloud.inactiveText', { email: phase.session.email }) : t('cloud.pendingText', { email: phase.session.email })}
          </p>
          <div className="flex gap-2">
            <Button variant="primary" icon={RefreshCw} onClick={() => void enter(phase.session)}>
              {t('cloud.check')}
            </Button>
            <Button icon={LogOut} onClick={() => void getCloudBackend().then((b) => b.signOut()).then(() => enter(null))}>
              {t('cloud.logout')}
            </Button>
          </div>
        </div>
      ) : (
        <CloudLogin onSignedIn={() => void getCloudBackend().then(async (b) => enter(await b.getSession()))} />
      )}
    </Shell>
  );
}

function Shell({ children }: { children: ReactNode }) {
  const { t, locale, setLocale } = useI18n();
  return (
    <div className="flex min-h-screen flex-col bg-slate-900 dark:bg-slate-950">
      <DisclaimerStrip />
      <div className="flex flex-1 items-center justify-center p-4">
      <div className="w-full max-w-md">
        <div className="mb-6 flex items-center justify-center gap-3 text-white">
          <div className="flex size-11 items-center justify-center rounded-xl bg-brand-500 text-slate-950">
            <Cog className="size-6" strokeWidth={2.5} />
          </div>
          <div>
            <p className="text-xl font-bold">{APP_CONFIG.appName}</p>
            <p className="text-xs text-slate-400">{t('app.tagline')}</p>
          </div>
        </div>
        {children}
        <div className="mt-4 flex justify-center gap-1">
          {LOCALES.map((l) => (
            <button key={l.value} onClick={() => setLocale(l.value)} className={cn('rounded-md px-2.5 py-1 text-xs font-semibold', locale === l.value ? 'bg-slate-700 text-white' : 'text-slate-400 hover:text-white')}>
              {l.flag} {l.short}
            </button>
          ))}
        </div>
      </div>
      </div>
    </div>
  );
}

type Mode = 'signIn' | 'signUp' | 'reset';

function CloudLogin({ onSignedIn }: { onSignedIn: () => void }) {
  const { t } = useI18n();
  const [mode, setMode] = useState<Mode>('signIn');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [name, setName] = useState('');
  const [error, setError] = useState('');
  const [info, setInfo] = useState('');
  const [busy, setBusy] = useState(false);

  const switchMode = (m: Mode) => {
    setMode(m);
    setError('');
    setInfo('');
  };

  const submit = async (e: FormEvent) => {
    e.preventDefault();
    setError('');
    setInfo('');
    if (!email.trim() || (mode !== 'reset' && !password)) return setError(t('cloud.required'));
    if (mode === 'signUp' && password.length < 8) return setError(t('cloud.passwordShort'));
    setBusy(true);
    const b = await getCloudBackend();
    try {
      if (mode === 'signIn') {
        const r = await b.signIn(email.trim(), password);
        if (r.error) setError(r.error);
        else onSignedIn();
      } else if (mode === 'signUp') {
        const r = await b.signUp(email.trim(), password, name.trim());
        if (r.error) setError(r.error);
        else if (r.needsConfirmation) {
          setInfo(t('cloud.checkEmail'));
          setMode('signIn');
        } else onSignedIn();
      } else {
        const r = await b.resetPassword(email.trim());
        if (r.error) setError(r.error);
        else setInfo(t('cloud.resetSent'));
      }
    } finally {
      setBusy(false);
    }
  };

  const title = mode === 'signIn' ? t('cloud.signInTitle') : mode === 'signUp' ? t('cloud.signUpTitle') : t('cloud.resetTitle');
  const subtitle = mode === 'signIn' ? t('cloud.signInSubtitle') : mode === 'signUp' ? t('cloud.signUpSubtitle') : '';

  return (
    <form onSubmit={submit} className="card space-y-4 p-6" noValidate>
      <div>
        <h1 className="text-lg font-semibold text-slate-900 dark:text-white">{title}</h1>
        {subtitle && <p className="text-sm text-slate-500">{subtitle}</p>}
      </div>
      {mode === 'signUp' && (
        <div className="space-y-1.5">
          <label htmlFor="cl-name" className="text-sm font-medium">
            {t('cloud.name')}
          </label>
          <Input id="cl-name" name="name" autoComplete="name" value={name} onChange={(e) => setName(e.target.value)} />
        </div>
      )}
      <div className="space-y-1.5">
        <label htmlFor="cl-email" className="flex items-center gap-1.5 text-sm font-medium">
          <Mail className="size-4 text-slate-400" /> {t('cloud.email')}
        </label>
        <Input id="cl-email" name="email" type="email" autoComplete="email" value={email} onChange={(e) => setEmail(e.target.value)} autoFocus />
      </div>
      {mode !== 'reset' && (
        <div className="space-y-1.5">
          <label htmlFor="cl-password" className="flex items-center gap-1.5 text-sm font-medium">
            <KeyRound className="size-4 text-slate-400" /> {t('cloud.password')}
          </label>
          <Input id="cl-password" name="password" type="password" autoComplete={mode === 'signUp' ? 'new-password' : 'current-password'} value={password} onChange={(e) => setPassword(e.target.value)} />
          {mode === 'signUp' && <p className="text-xs text-slate-500">{t('cloud.passwordHint')}</p>}
        </div>
      )}
      {error && (
        <p role="alert" className="text-sm text-red-600">
          {error}
        </p>
      )}
      {info && (
        <p role="status" className="rounded-lg bg-green-50 p-3 text-sm text-green-800 dark:bg-green-950/40 dark:text-green-300">
          {info}
        </p>
      )}
      <Button type="submit" variant="primary" icon={mode === 'signUp' ? UserPlus : mode === 'reset' ? Mail : LogIn} className="w-full" disabled={busy}>
        {mode === 'signIn' ? t('cloud.signIn') : mode === 'signUp' ? t('cloud.signUp') : t('cloud.sendReset')}
      </Button>
      <div className="flex flex-wrap justify-between gap-2 text-sm">
        {mode !== 'signIn' ? (
          <button type="button" className="font-medium text-brand-700 hover:underline dark:text-brand-400" onClick={() => switchMode('signIn')}>
            {t('cloud.haveAccount')}
          </button>
        ) : (
          <button type="button" className="font-medium text-brand-700 hover:underline dark:text-brand-400" onClick={() => switchMode('signUp')}>
            {t('cloud.noAccount')}
          </button>
        )}
        {mode === 'signIn' && (
          <button type="button" className="text-slate-500 hover:underline" onClick={() => switchMode('reset')}>
            {t('cloud.forgot')}
          </button>
        )}
      </div>
    </form>
  );
}
