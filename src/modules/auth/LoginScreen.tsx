import { useState, type FormEvent } from 'react';
import { KeyRound, LogIn, Info } from 'lucide-react';
import { login } from '@/app/session';
import { navigate } from '@/app/router';
import { repos } from '@/data/db';
import { StatusBadge } from '@/components/ui/Badge';
import { Button } from '@/components/ui/Button';
import { Input } from '@/components/ui/Field';
import { useCollection } from '@/data/hooks';
import { CLOUD } from '@/data/db';
import { LOCALES, useI18n } from '@/i18n';
import { cn } from '@/lib/cn';
import { BrandLogo } from '@/components/layout/BrandLogo';
import { BuildInfo, DisclaimerStrip } from '@/components/layout/Disclaimer';

/** Tela de entrada: escolha do usuário + PIN. */
export function LoginScreen({ revealMaster = false }: { revealMaster?: boolean }) {
  const { t, locale, setLocale } = useI18n();
  // Master fica escondido: aparece com #/admin ou com 5 cliques na logo.
  const [logoClicks, setLogoClicks] = useState(0);
  const showMaster = revealMaster || logoClicks >= 5;
  const users = useCollection('users').filter((u) => u.active && (showMaster || u.role !== 'master'));
  const [userId, setUserId] = useState(() => (revealMaster ? users.find((u) => u.role === 'master')?.id : users[0]?.id) ?? '');
  const [pin, setPin] = useState('');
  const [error, setError] = useState(false);
  const [busy, setBusy] = useState(false);

  const submit = async (e: FormEvent) => {
    e.preventDefault();
    setBusy(true);
    const ok = await login(userId, pin);
    setBusy(false);
    if (ok && window.location.hash.startsWith('#/admin')) navigate('/calendar');
    if (!ok) {
      setError(true);
      setPin('');
    }
  };

  return (
    <div className="flex min-h-screen flex-col bg-slate-900 dark:bg-slate-950">
      <DisclaimerStrip />
      <div className="flex flex-1 items-center justify-center p-4">
      <div className="w-full max-w-md">
        <div className="mb-6 flex flex-col items-center gap-1 text-white">
          <button
            type="button"
            tabIndex={-1}
            aria-hidden
            className="cursor-default"
            onClick={() =>
              setLogoClicks((n) => {
                const next = n + 1;
                if (next === 5) {
                  const master = users.find((u) => u.role === 'master') ?? undefined;
                  const m = master ?? repos.users.getAll().find((u) => u.role === 'master' && u.active);
                  if (m) setUserId(m.id);
                }
                return next;
              })
            }
          >
            <BrandLogo className="w-48" />
          </button>
          <p className="text-xs text-slate-400">
            <span className="font-semibold text-slate-200">Ops</span> · {t('app.tagline')}
          </p>
        </div>

        <form onSubmit={submit} className="card space-y-5 p-6">
          <div>
            <h1 className="text-lg font-semibold text-slate-900 dark:text-white">{t('auth.title')}</h1>
            <p className="text-sm text-slate-500">{t('auth.subtitle')}</p>
          </div>

          <div className="grid gap-2" role="radiogroup" aria-label={t('users.role')}>
            {users.map((u) => (
              <button
                key={u.id}
                type="button"
                role="radio"
                aria-checked={userId === u.id}
                onClick={() => {
                  setUserId(u.id);
                  setError(false);
                }}
                className={cn(
                  'flex items-center justify-between gap-3 rounded-lg border px-3 py-2.5 text-left transition',
                  userId === u.id ? 'border-brand-500 bg-brand-50 ring-1 ring-brand-500 dark:bg-brand-500/10' : 'border-slate-300 hover:bg-slate-50 dark:border-slate-700 dark:hover:bg-slate-800',
                )}
              >
                <span>
                  <span className="block font-medium">{u.name}</span>
                  <span className="block text-xs text-slate-500">{t(`users.roleHints.${u.role}`)}</span>
                </span>
                <StatusBadge kind="userRole" value={u.role} />
              </button>
            ))}
          </div>

          <div className="space-y-1.5">
            <label htmlFor="pin" className="flex items-center gap-1.5 text-sm font-medium">
              <KeyRound className="size-4 text-slate-400" /> {t('auth.pin')}
            </label>
            <Input
              id="pin"
              name="pin"
              type="password"
              inputMode="numeric"
              autoComplete="current-password"
              maxLength={8}
              value={pin}
              onChange={(e) => {
                setPin(e.target.value.replace(/\D/g, ''));
                setError(false);
              }}
              invalid={error}
              className="text-center font-mono text-lg tracking-[0.5em]"
              autoFocus
            />
            {error && (
              <p role="alert" className="text-sm text-red-600">
                {t('auth.wrongPin')}
              </p>
            )}
          </div>

          <Button type="submit" variant="primary" icon={LogIn} className="w-full" disabled={!userId || pin.length < 4 || busy}>
            {t('auth.enter')}
          </Button>

          <div className="flex gap-2 rounded-lg bg-slate-50 p-3 text-xs text-slate-500 dark:bg-slate-800/50">
            <Info className="mt-0.5 size-4 shrink-0" />
            <div className="space-y-1">
              <p>{CLOUD ? t('auth.cloudNote') : t('auth.localNote')}</p>
              <p className="font-medium">{t('auth.demoPins')}</p>
            </div>
          </div>
        </form>

        <div className="mt-4 flex justify-center gap-1">
          {LOCALES.map((l) => (
            <button key={l.value} onClick={() => setLocale(l.value)} className={cn('rounded-md px-2.5 py-1 text-xs font-semibold', locale === l.value ? 'bg-slate-700 text-white' : 'text-slate-400 hover:text-white')}>
              {l.flag} {l.short}
            </button>
          ))}
        </div>
        <BuildInfo />
      </div>
      </div>
    </div>
  );
}
