import { useState, type FormEvent } from 'react';
import { Pencil, Plus, Save, UserCog } from 'lucide-react';
import { hashPin, useCurrentUser } from '@/app/session';
import { StatusBadge } from '@/components/ui/Badge';
import { Button } from '@/components/ui/Button';
import { Drawer } from '@/components/ui/Drawer';
import { Field, Input, Select } from '@/components/ui/Field';
import { useToast } from '@/components/ui/Toast';
import { CLOUD, repos } from '@/data/db';
import { Badge } from '@/components/ui/Badge';
import { Modal } from '@/components/ui/Modal';
import { useCollection } from '@/data/hooks';
import { enumOptions } from '@/domain/labels';
import { useI18n } from '@/i18n';
import type { TranslationKey } from '@/i18n/types';
import { newId } from '@/lib/id';
import type { User, UserRole } from '@/types/models';

/** Cadastro de usuários e perfis (somente Master). */
export function UsersSection() {
  const { t } = useI18n();
  const users = useCollection('users');
  const me = useCurrentUser();
  const [editing, setEditing] = useState<{ user?: User } | null>(null);
  const [howTo, setHowTo] = useState(false);

  return (
    <section className="card p-5 lg:col-span-2">
      <div className="mb-4 flex items-start justify-between gap-4">
        <div>
          <h2 className="flex items-center gap-2 font-semibold text-slate-900 dark:text-white">
            <UserCog className="size-5 text-slate-400" /> {t('users.title')}
          </h2>
          <p className="text-sm text-slate-500">{t('users.hint')}</p>
          {CLOUD && <p className="mt-1 text-sm text-slate-500">{t('cloud.usersHint')}</p>}
        </div>
        <Button variant="primary" icon={Plus} onClick={() => (CLOUD ? setHowTo(true) : setEditing({}))}>
          {t('users.new')}
        </Button>
      </div>
      <ul className="divide-y divide-slate-100 rounded-lg border border-slate-200 dark:divide-slate-800 dark:border-slate-800">
        {users.map((u) => (
          <li key={u.id} className="flex items-center gap-3 px-3 py-2.5 text-sm">
            <div className="min-w-0 flex-1">
              <p className={u.active ? 'font-medium' : 'font-medium text-slate-400 line-through'}>
                {u.name} {u.id === me?.id && <span className="text-xs text-slate-500">({t('users.you')})</span>}
              </p>
              <p className="text-xs text-slate-500">
                {u.email} · {t(`users.roleHints.${u.role}`)}
              </p>
            </div>
            {u.pending ? <Badge tone="amber" dot>{t('cloud.pending')}</Badge> : <StatusBadge kind="userRole" value={u.role} />}
            <Button size="sm" variant="ghost" icon={Pencil} onClick={() => setEditing({ user: u })} aria-label={t('common.edit')} />
          </li>
        ))}
      </ul>
      <UserDrawer open={!!editing} user={editing?.user} onClose={() => setEditing(null)} />
      <Modal open={howTo} onClose={() => setHowTo(false)} title={t('cloud.newUserTitle')} footer={<Button onClick={() => setHowTo(false)}>{t('common.close')}</Button>}>
        {t('cloud.newUserText')}
      </Modal>
    </section>
  );
}

function UserDrawer({ open, user, onClose }: { open: boolean; user?: User; onClose: () => void }) {
  const { t } = useI18n();
  const toast = useToast();
  const users = useCollection('users');
  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [role, setRole] = useState<UserRole>('office');
  const [active, setActive] = useState(true);
  const [pin, setPin] = useState('');
  const [error, setError] = useState<TranslationKey>();
  const [lastKey, setLastKey] = useState<string>();

  // Reinicia ao abrir para outro usuário.
  const key = open ? (user?.id ?? 'new') : undefined;
  if (key !== lastKey) {
    setLastKey(key);
    setName(user?.name ?? '');
    setEmail(user?.email ?? '');
    setRole(user?.role ?? 'office');
    setActive(user?.active ?? true);
    setPin('');
    setError(undefined);
  }

  const submit = async (e: FormEvent) => {
    e.preventDefault();
    if (!name.trim()) return setError('users.nameRequired');
    if (!CLOUD && (!user || pin) && !/^\d{4,8}$/.test(pin)) return setError('users.pinInvalid');
    const otherMasters = users.filter((u) => u.id !== user?.id && u.role === 'master' && u.active).length;
    if (user?.role === 'master' && (role !== 'master' || !active) && otherMasters === 0) return setError('users.lastMaster');
    const id = user?.id ?? newId('u');
    const pinHash = !CLOUD && pin ? await hashPin(id, pin) : (user?.pinHash ?? '');
    const data: User = { id, name: name.trim(), email: email.trim(), role, active, pinHash, pending: false };
    if (user) repos.users.update(id, data);
    else repos.users.create(data);
    toast.success(t('users.saved'));
    onClose();
  };

  return (
    <Drawer
      open={open}
      onClose={onClose}
      title={user ? t('users.editTitle') : t('users.newTitle')}
      subtitle={user?.name}
      footer={
        <>
          <Button onClick={onClose}>{t('common.cancel')}</Button>
          <Button variant="primary" icon={Save} type="submit" form="user-form">
            {t('common.save')}
          </Button>
        </>
      }
    >
      <form id="user-form" onSubmit={submit} className="space-y-4" noValidate>
        <Field label={t('users.name')} required>
          {(id) => <Input id={id} name="userName" value={name} onChange={(e) => setName(e.target.value)} autoFocus />}
        </Field>
        <Field label={t('users.email')}>
          {(id) => <Input id={id} type="email" value={email} onChange={(e) => setEmail(e.target.value)} disabled={CLOUD} />}
        </Field>
        <Field label={t('users.role')} hint={t(`users.roleHints.${role}`)}>
          {(id) => <Select<UserRole> id={id} name="userRole" value={role} onChange={setRole} options={enumOptions(t, 'userRole')} />}
        </Field>
        {!CLOUD && (
        <Field label={t('users.pin')} required={!user} hint={user ? t('users.pinKeep') : undefined}>
          {(id) => <Input id={id} name="userPin" type="password" inputMode="numeric" maxLength={8} value={pin} onChange={(e) => setPin(e.target.value.replace(/\D/g, ''))} className="font-mono tracking-widest" />}
        </Field>
        )}
        <label className="flex items-center gap-2 text-sm">
          <input type="checkbox" className="size-4 accent-amber-500" checked={active} onChange={(e) => setActive(e.target.checked)} /> {t('users.active')}
        </label>
        {error && (
          <p role="alert" className="text-sm font-medium text-red-600">
            {t(error)}
          </p>
        )}
      </form>
    </Drawer>
  );
}
