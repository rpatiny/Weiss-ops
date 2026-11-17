import { useEffect, useState, type FormEvent } from 'react';
import { KeyRound, LogIn, LogOut, Printer, ShieldCheck } from 'lucide-react';
import { useRoute } from '@/app/router';
import { BrandLogo } from '@/components/layout/BrandLogo';
import { DisclaimerStrip } from '@/components/layout/Disclaimer';
import { Button } from '@/components/ui/Button';
import { Field, Input } from '@/components/ui/Field';
import { useCollection } from '@/data/hooks';
import { buildPortalView, normName, portalLogin } from '@/domain/portal';
import { LOCALES, useI18n } from '@/i18n';
import { cn } from '@/lib/cn';
import { CustomerReportView } from './CustomerReportView';

const IDLE_MS = 30 * 60_000;
const sessionKey = (token: string) => `spindleops:portal-session:${token}`;

function readSession(token: string): { accountId: string; at: number } | null {
  try {
    const s = JSON.parse(sessionStorage.getItem(sessionKey(token)) ?? '') as { accountId: string; at: number };
    return Date.now() - s.at < IDLE_MS ? s : null;
  } catch {
    return null;
  }
}
function writeSession(token: string, accountId: string | null) {
  try {
    if (accountId) sessionStorage.setItem(sessionKey(token), JSON.stringify({ accountId, at: Date.now() }));
    else sessionStorage.removeItem(sessionKey(token));
  } catch {
    /* ignore */
  }
}

/**
 * Portal do cliente (`#/portal?p=<token>`): o cliente entra com usuário + senha de 6 dígitos e vê SÓ o relatório aprovado
 * do projeto do link. Sessão desta aba, expira após 30 min sem uso. Link desligado ou conta inativa ⇒ volta ao login.
 */
export function CustomerPortalPage() {
  const { t, locale, setLocale } = useI18n();
  const { params } = useRoute();
  const token = params.get('p') ?? '';
  const projects = useCollection('projects');
  const accounts = useCollection('customers');
  const updates = useCollection('projectUpdates');
  const phases = useCollection('workPhases');
  const [accountId, setAccountId] = useState<string | null>(() => readSession(token)?.accountId ?? null);

  const project = token ? projects.find((p) => p.portalToken === token) : undefined;
  const account = accountId ? accounts.find((a) => a.id === accountId) : undefined;
  // Revalida sempre: link ainda ativo, conta ativa e do mesmo cliente.
  const allowed = !!project && !!account && account.active && normName(account.name) === normName(project.customer);

  useEffect(() => {
    if (accountId && !allowed) {
      writeSession(token, null);
      setAccountId(null);
    }
  }, [accountId, allowed, token]);

  // Renova a sessão com o uso; expira sozinha após 30 min parado.
  useEffect(() => {
    if (!allowed) return;
    const bump = () => writeSession(token, accountId);
    window.addEventListener('pointerdown', bump);
    const timer = setInterval(() => {
      if (!readSession(token)) setAccountId(null);
    }, 30_000);
    return () => {
      window.removeEventListener('pointerdown', bump);
      clearInterval(timer);
    };
  }, [allowed, token, accountId]);

  useEffect(() => {
    document.title = allowed && project ? `${project.projectNumber} · Weiss` : 'Weiss · Customer portal';
  }, [allowed, project]);

  return (
    <div className="flex min-h-dvh flex-col bg-slate-100 dark:bg-slate-950">
      <div className="print:hidden">
        <DisclaimerStrip />
      </div>
      <header className="flex items-center justify-between gap-3 bg-slate-900 px-4 py-3 text-white print:bg-white print:text-black">
        <div className="flex items-center gap-2.5">
          <BrandLogo className="w-20 print:hidden" />
          <BrandLogo onDark={false} className="hidden w-20 print:block" />
          <p className="border-l border-slate-700 pl-2.5 font-bold leading-tight">{t('portal.page.title')}</p>
        </div>
        <div className="flex items-center gap-1 print:hidden">
          {LOCALES.map((l) => (
            <button key={l.value} onClick={() => setLocale(l.value)} className={cn('rounded-md px-2 py-1 text-xs font-semibold', locale === l.value ? 'bg-slate-700 text-white' : 'text-slate-400')}>
              {l.short}
            </button>
          ))}
          {allowed && (
            <button
              onClick={() => {
                writeSession(token, null);
                setAccountId(null);
              }}
              className="ml-1 rounded-lg p-2 text-slate-300 hover:bg-slate-800"
              aria-label={t('portal.page.signOut')}
              title={t('portal.page.signOut')}
            >
              <LogOut className="size-5" />
            </button>
          )}
        </div>
      </header>

      <main className="mx-auto w-full max-w-3xl min-w-0 flex-1 px-4 py-6">
        {allowed && project ? (
          <>
            <div className="mb-4 flex flex-wrap items-center justify-between gap-2 print:hidden">
              <p className="text-sm text-slate-500">{t('portal.page.welcome', { name: account!.name })}</p>
              <Button icon={Printer} onClick={() => window.print()}>
                {t('portal.page.print')}
              </Button>
            </div>
            <CustomerReportView view={buildPortalView(project, updates, phases)} />
            <p className="mt-6 flex items-center gap-1.5 text-xs text-slate-500">
              <ShieldCheck className="size-4" /> {t('portal.page.footer')}
            </p>
          </>
        ) : (
          <LoginCard
            token={token}
            onOk={(id) => {
              writeSession(token, id);
              setAccountId(id);
            }}
          />
        )}
      </main>
    </div>
  );
}

function LoginCard({ token, onOk }: { token: string; onOk: (accountId: string) => void }) {
  const { t } = useI18n();
  const [username, setUsername] = useState('');
  const [pin, setPin] = useState('');
  const [error, setError] = useState('');

  const submit = (e: FormEvent) => {
    e.preventDefault();
    const r = portalLogin(token, username, pin);
    if (r.ok) return onOk(r.account.id);
    setPin('');
    setError(t(r.error, { minutes: r.minutes ?? 0 }));
  };

  return (
    <form onSubmit={submit} className="card mx-auto mt-6 max-w-sm space-y-4 p-6" noValidate>
      <div>
        <h1 className="flex items-center gap-2 text-lg font-bold text-slate-900 dark:text-white">
          <KeyRound className="size-5 text-slate-400" /> {t('portal.page.loginTitle')}
        </h1>
        <p className="mt-1 text-sm text-slate-500">{t('portal.page.loginHint')}</p>
      </div>
      <Field label={t('portal.accounts.username')}>
        {(id) => <Input id={id} autoComplete="username" autoCapitalize="none" autoFocus value={username} onChange={(e) => { setUsername(e.target.value); setError(''); }} />}
      </Field>
      <Field label={t('portal.accounts.pin')}>
        {(id) => (
          <Input
            id={id}
            type="password"
            inputMode="numeric"
            autoComplete="current-password"
            maxLength={6}
            className="font-mono tracking-[0.4em]"
            value={pin}
            onChange={(e) => { setPin(e.target.value.replace(/\D/g, '').slice(0, 6)); setError(''); }}
          />
        )}
      </Field>
      {error && (
        <p role="alert" className="text-sm font-medium text-red-600">
          {error}
        </p>
      )}
      <Button variant="primary" icon={LogIn} type="submit" className="w-full justify-center" disabled={!username.trim() || pin.length !== 6}>
        {t('portal.page.signIn')}
      </Button>
    </form>
  );
}
