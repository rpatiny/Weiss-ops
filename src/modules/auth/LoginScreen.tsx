import { useState, type FormEvent } from 'react';
import { Cog, KeyRound, LogIn, Info } from 'lucide-react';
import { login } from '@/app/session';
import { StatusBadge } from '@/components/ui/Badge';
import { Button } from '@/components/ui/Button';
import { Input } from '@/components/ui/Field';
import { useCollection } from '@/data/hooks';
import { LOCALES, useI18n } from '@/i18n';
import { APP_CONFIG } from '@/lib/config';
import { cn } from '@/lib/cn';

/** Tela de entrada: escolha do usuário + PIN. */
export function LoginScreen() {
  const { t, locale, setLocale } = useI18n();
  const users = useCollection('users').filter((u) => u.active);
  const [userId, setUserId] = useState(users[0]?.id ?? '');
  const [pin, setPin] = useState('');
  const [error, setError] = useState(false);
  const [busy, setBusy] = useState(false);

  const submit = async (e: FormEvent) => {
    e.preventDefault();
    setBusy(true);
    const ok = await login(userId, pin);
    setBusy(false);
    if (!ok) {
      setError(true);
      setPin('');
    }
  };

  return (
    <div className="flex min-h-screen items-center justify-center bg-slate-900 p-4 dark:bg-slate-950">
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
              <p>{t('auth.localNote')}</p>
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
      </div>
    </div>
  );
}
