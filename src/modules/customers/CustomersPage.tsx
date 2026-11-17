import { useMemo, useState, type FormEvent } from 'react';
import { Building2, Copy, KeyRound, Pencil, Plus, Save, Trash2 } from 'lucide-react';
import { useCan } from '@/app/session';
import { Badge } from '@/components/ui/Badge';
import { Button } from '@/components/ui/Button';
import { Drawer } from '@/components/ui/Drawer';
import { Field, Input } from '@/components/ui/Field';
import { ConfirmDialog, Modal } from '@/components/ui/Modal';
import { EmptyState, PageHeader } from '@/components/ui/misc';
import { useToast } from '@/components/ui/Toast';
import { useCollection } from '@/data/hooks';
import { accountService, normName, validateAccount, type AccountDraft } from '@/domain/portal';
import { useI18n } from '@/i18n';
import type { CustomerAccount } from '@/types/models';

const emptyDraft = (): AccountDraft => ({ name: '', username: '', email: '', active: true });

/** Sugere usuário a partir do nome do cliente ("Rolls-Royce" → "rolls-royce"). */
const suggestUsername = (name: string) =>
  name
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 32);

/**
 * Contas dos CLIENTES para o portal (usuário + senha de 6 dígitos). A senha é gerada pelo sistema e mostrada uma única
 * vez — para trocar, "Nova senha". Cada conta enxerga os projetos com o mesmo nome de cliente.
 */
export function CustomersPage() {
  const { t } = useI18n();
  const toast = useToast();
  const canEdit = useCan()('customers.manage');
  const accounts = useCollection('customers');
  const projects = useCollection('projects');
  const [editing, setEditing] = useState<CustomerAccount | 'new'>();
  const [shownPin, setShownPin] = useState<{ account: CustomerAccount; pin: string }>();
  const [resetting, setResetting] = useState<CustomerAccount>();
  const [deleting, setDeleting] = useState<CustomerAccount>();

  const projectCount = useMemo(() => {
    const m = new Map<string, number>();
    for (const p of projects) m.set(normName(p.customer), (m.get(normName(p.customer)) ?? 0) + 1);
    return m;
  }, [projects]);
  const sorted = [...accounts].sort((a, b) => a.name.localeCompare(b.name) || a.username.localeCompare(b.username));

  return (
    <>
      <PageHeader
        icon={Building2}
        title={t('portal.accounts.title')}
        description={t('portal.accounts.description')}
        actions={
          canEdit && (
            <Button variant="primary" icon={Plus} onClick={() => setEditing('new')}>
              {t('portal.accounts.new')}
            </Button>
          )
        }
      />

      {sorted.length === 0 ? (
        <EmptyState icon={Building2} title={t('portal.accounts.empty')} description={t('portal.accounts.emptyHint')} />
      ) : (
        <div className="card overflow-x-auto">
          <table className="w-full min-w-[640px]">
            <thead className="border-b border-slate-200 dark:border-slate-800">
              <tr>
                <th className="th">{t('portal.accounts.customer')}</th>
                <th className="th">{t('portal.accounts.username')}</th>
                <th className="th">{t('portal.accounts.email')}</th>
                <th className="th">{t('portal.accounts.projects')}</th>
                <th className="th">{t('common.status')}</th>
                <th className="th" />
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100 dark:divide-slate-800">
              {sorted.map((a) => (
                <tr key={a.id}>
                  <td className="td font-medium">{a.name}</td>
                  <td className="td font-mono text-sm">{a.username}</td>
                  <td className="td text-sm text-slate-500">{a.email ?? '—'}</td>
                  <td className="td text-sm tabular-nums">{projectCount.get(normName(a.name)) ?? 0}</td>
                  <td className="td">
                    <Badge tone={a.active ? 'green' : 'slate'} dot>
                      {a.active ? t('portal.accounts.active') : t('portal.accounts.inactive')}
                    </Badge>
                  </td>
                  <td className="td">
                    {canEdit && (
                      <div className="flex justify-end gap-1">
                        <Button size="sm" variant="ghost" icon={KeyRound} onClick={() => setResetting(a)} title={t('portal.accounts.resetPin')} aria-label={t('portal.accounts.resetPin')} />
                        <Button size="sm" variant="ghost" icon={Pencil} onClick={() => setEditing(a)} title={t('common.edit')} aria-label={t('common.edit')} />
                        <Button size="sm" variant="ghost" icon={Trash2} className="text-red-600" onClick={() => setDeleting(a)} title={t('common.delete')} aria-label={t('common.delete')} />
                      </div>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      <AccountDrawer
        open={!!editing}
        account={editing === 'new' ? undefined : editing}
        onClose={() => setEditing(undefined)}
        onCreated={(account, pin) => {
          setEditing(undefined);
          setShownPin({ account, pin });
        }}
      />

      <Modal
        open={!!shownPin}
        onClose={() => setShownPin(undefined)}
        title={t('portal.accounts.pinTitle')}
        footer={
          <Button variant="primary" onClick={() => setShownPin(undefined)}>
            {t('portal.accounts.pinDone')}
          </Button>
        }
      >
        {shownPin && (
          <div className="space-y-3">
            <p className="text-sm text-slate-600 dark:text-slate-300">{t('portal.accounts.pinOnce', { name: shownPin.account.name })}</p>
            <dl className="grid grid-cols-[auto_1fr] items-center gap-x-4 gap-y-2 rounded-lg bg-slate-50 p-4 dark:bg-slate-800/60">
              <dt className="text-sm text-slate-500">{t('portal.accounts.username')}</dt>
              <dd className="font-mono text-lg font-semibold">{shownPin.account.username}</dd>
              <dt className="text-sm text-slate-500">{t('portal.accounts.pin')}</dt>
              <dd className="font-mono text-2xl font-bold tracking-[0.3em]">{shownPin.pin}</dd>
            </dl>
            <Button
              icon={Copy}
              onClick={() => {
                void navigator.clipboard?.writeText(`${t('portal.accounts.username')}: ${shownPin.account.username}\n${t('portal.accounts.pin')}: ${shownPin.pin}`);
                toast.success(t('portal.copied'));
              }}
            >
              {t('portal.accounts.copyCredentials')}
            </Button>
          </div>
        )}
      </Modal>

      <ConfirmDialog
        open={!!resetting}
        danger={false}
        title={t('portal.accounts.resetTitle', { username: resetting?.username ?? '' })}
        message={t('portal.accounts.resetMessage')}
        confirmLabel={t('portal.accounts.resetPin')}
        onCancel={() => setResetting(undefined)}
        onConfirm={() => {
          const a = resetting!;
          setResetting(undefined);
          setShownPin({ account: a, pin: accountService.resetPin(a.id) });
        }}
      />
      <ConfirmDialog
        open={!!deleting}
        title={t('portal.accounts.deleteTitle', { username: deleting?.username ?? '' })}
        message={t('portal.accounts.deleteMessage')}
        confirmLabel={t('common.delete')}
        onCancel={() => setDeleting(undefined)}
        onConfirm={() => {
          accountService.remove(deleting!.id);
          setDeleting(undefined);
          toast.success(t('portal.accounts.deleted'));
        }}
      />
    </>
  );
}

function AccountDrawer({ open, account, onClose, onCreated }: { open: boolean; account?: CustomerAccount; onClose: () => void; onCreated: (a: CustomerAccount, pin: string) => void }) {
  const { t } = useI18n();
  const toast = useToast();
  const accounts = useCollection('customers');
  const projects = useCollection('projects');
  const [d, setD] = useState<AccountDraft>(emptyDraft());
  const [errors, setErrors] = useState<ReturnType<typeof validateAccount>>({});
  const [userTouched, setUserTouched] = useState(false);
  const [lastKey, setLastKey] = useState<string>();
  const key = `${open}-${account?.id ?? 'new'}`;
  if (key !== lastKey) {
    setLastKey(key);
    setD(account ? { name: account.name, username: account.username, email: account.email ?? '', active: account.active } : emptyDraft());
    setErrors({});
    setUserTouched(!!account);
  }
  const customers = useMemo(() => [...new Set(projects.map((p) => p.customer.trim()).filter(Boolean))].sort(), [projects]);
  const matches = d.name.trim() ? projects.filter((p) => normName(p.customer) === normName(d.name)).length : 0;

  const submit = (e: FormEvent) => {
    e.preventDefault();
    const errs = validateAccount(d, accounts, account?.id);
    setErrors(errs);
    if (Object.keys(errs).length) return;
    if (account) {
      accountService.update(account.id, d);
      toast.success(t('portal.accounts.saved'));
      onClose();
    } else {
      const r = accountService.create(d);
      onCreated(r.account, r.pin);
    }
  };

  return (
    <Drawer
      open={open}
      onClose={onClose}
      title={account ? t('portal.accounts.editTitle', { username: account.username }) : t('portal.accounts.new')}
      footer={
        <>
          <Button onClick={onClose}>{t('common.cancel')}</Button>
          <Button variant="primary" icon={Save} type="submit" form="account-form">
            {account ? t('common.save') : t('portal.accounts.createAndShow')}
          </Button>
        </>
      }
    >
      <form id="account-form" onSubmit={submit} className="space-y-5" noValidate>
        <Field label={t('portal.accounts.customer')} required error={errors.name && t(errors.name)} hint={d.name.trim() ? t('portal.accounts.matches', { count: matches }) : t('portal.accounts.customerHint')}>
          {(id) => (
            <Input
              id={id}
              list="cus-names"
              value={d.name}
              autoFocus={!account}
              invalid={!!errors.name}
              onChange={(e) => setD((x) => ({ ...x, name: e.target.value, username: userTouched ? x.username : suggestUsername(e.target.value) }))}
            />
          )}
        </Field>
        <datalist id="cus-names">
          {customers.map((c) => (
            <option key={c} value={c} />
          ))}
        </datalist>
        <Field label={t('portal.accounts.username')} required error={errors.username && t(errors.username)} hint={t('portal.accounts.usernameHint')}>
          {(id) => (
            <Input
              id={id}
              className="font-mono"
              autoComplete="off"
              value={d.username}
              invalid={!!errors.username}
              onChange={(e) => {
                setUserTouched(true);
                setD((x) => ({ ...x, username: e.target.value.toLowerCase() }));
              }}
            />
          )}
        </Field>
        <Field label={t('portal.accounts.email')} error={errors.email && t(errors.email)}>
          {(id) => <Input id={id} type="email" value={d.email} invalid={!!errors.email} onChange={(e) => setD((x) => ({ ...x, email: e.target.value }))} />}
        </Field>
        <label className="flex items-center gap-2 text-sm">
          <input type="checkbox" className="size-4 accent-neutral-900" checked={d.active} onChange={(e) => setD((x) => ({ ...x, active: e.target.checked }))} />
          {t('portal.accounts.activeLabel')}
        </label>
        {!account && <p className="rounded-lg bg-slate-50 p-3 text-sm text-slate-600 dark:bg-slate-800/60 dark:text-slate-300">{t('portal.accounts.pinWillShow')}</p>}
      </form>
    </Drawer>
  );
}
