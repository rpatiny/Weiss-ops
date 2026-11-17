import { useMemo, useState, type FormEvent } from 'react';
import { Building2, Copy, KeyRound, Lock, Pencil, Plus, Save, Search, Trash2, Truck, TriangleAlert } from 'lucide-react';
import { useCan } from '@/app/session';
import { Badge } from '@/components/ui/Badge';
import { Button } from '@/components/ui/Button';
import { Drawer } from '@/components/ui/Drawer';
import { Field, Input, Textarea } from '@/components/ui/Field';
import { ConfirmDialog, Modal } from '@/components/ui/Modal';
import { EmptyState, PageHeader } from '@/components/ui/misc';
import { useToast } from '@/components/ui/Toast';
import { useCollection } from '@/data/hooks';
import { clientService, deliveryAddressOf, deliveryContactOf, emptyAddress, emptyClient, formatAddress, normClientName, validateClient, type ClientDraft, type ClientErrors } from '@/domain/clients';
import { accountService, USERNAME_RE } from '@/domain/portal';
import { useI18n } from '@/i18n';
import { cn } from '@/lib/cn';
import type { Address, Client, CustomerAccount } from '@/types/models';

const suggestUsername = (name: string) =>
  name
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 32);

/**
 * Cadastro único de clientes: todos os dados, cobrança × ENTREGA (destacada para a Logística) e acesso ao portal.
 * Office/Master editam (`customers.manage`, com confirmação em registros salvos); Logística só consulta.
 */
export function CustomersPage() {
  const { t } = useI18n();
  const canEdit = useCan()('customers.manage');
  const clients = useCollection('clients');
  const projects = useCollection('projects');
  const accounts = useCollection('customers');
  const [query, setQuery] = useState('');
  const [open, setOpen] = useState<{ id?: string } | null>(null);

  const count = useMemo(() => {
    const m = new Map<string, number>();
    for (const p of projects) if (p.clientId) m.set(p.clientId, (m.get(p.clientId) ?? 0) + 1);
    return m;
  }, [projects]);
  const q = query.trim().toLowerCase();
  const list = [...clients]
    .filter((c) => !q || `${c.name} ${c.accountNumber} ${c.contactName} ${formatAddress(c.billingAddress)} ${formatAddress(deliveryAddressOf(c))}`.toLowerCase().includes(q))
    .sort((a, b) => Number(!!b.incomplete) - Number(!!a.incomplete) || a.name.localeCompare(b.name));
  const incomplete = clients.filter((c) => c.incomplete).length;

  return (
    <>
      <PageHeader
        icon={Building2}
        title={t('clients.title')}
        description={t('clients.description')}
        actions={
          canEdit && (
            <Button variant="primary" icon={Plus} onClick={() => setOpen({})}>
              {t('clients.new')}
            </Button>
          )
        }
      />
      {incomplete > 0 && (
        <p className="mb-4 flex items-center gap-2 rounded-lg bg-amber-50 p-3 text-sm text-amber-900 dark:bg-amber-500/10 dark:text-amber-200">
          <TriangleAlert className="size-4 shrink-0" /> {t('clients.incompleteBanner', { count: incomplete })}
        </p>
      )}
      <div className="relative mb-4 max-w-md">
        <Search className="pointer-events-none absolute top-1/2 left-3 size-4 -translate-y-1/2 text-slate-400" />
        <input className="input pl-9" value={query} onChange={(e) => setQuery(e.target.value)} placeholder={t('clients.search')} aria-label={t('clients.search')} />
      </div>

      {list.length === 0 ? (
        <EmptyState icon={Building2} title={t('clients.empty')} />
      ) : (
        <ul className="grid gap-3 lg:grid-cols-2">
          {list.map((c) => {
            const separate = !c.deliverySameAsBilling;
            const logins = accounts.filter((a) => a.clientId === c.id).length;
            return (
              <li key={c.id} className="min-w-0">
                <button type="button" onClick={() => setOpen({ id: c.id })} className="card block w-full min-w-0 p-4 text-left hover:border-brand-500/60">
                  <div className="flex flex-wrap items-start justify-between gap-2">
                    <div className="min-w-0">
                      <p className="font-mono text-xs text-slate-500">{c.accountNumber || '—'}</p>
                      <p className="truncate text-lg font-semibold text-slate-900 dark:text-white">{c.name}</p>
                      <p className="truncate text-sm text-slate-500">{[c.contactName, c.phone, c.email].filter(Boolean).join(' · ')}</p>
                    </div>
                    <div className="flex flex-wrap gap-1.5">
                      {c.incomplete && <Badge tone="amber">{t('clients.incomplete')}</Badge>}
                      <Badge tone="slate">{t('clients.projectsCount', { count: count.get(c.id) ?? 0 })}</Badge>
                      {logins > 0 && <Badge tone="violet">{t('clients.loginsCount', { count: logins })}</Badge>}
                    </div>
                  </div>
                  <DeliverTo client={c} compact className="mt-3" />
                  {separate && <p className="mt-1.5 text-xs text-slate-500">{t('clients.billingShort', { address: formatAddress(c.billingAddress) })}</p>}
                </button>
              </li>
            );
          })}
        </ul>
      )}
      <ClientDrawer open={!!open} clientId={open?.id} onClose={() => setOpen(null)} />
    </>
  );
}

/** Bloco destacado do endereço de ENTREGA (o que a Logística usa). */
export function DeliverTo({ client, compact = false, className }: { client: Client; compact?: boolean; className?: string }) {
  const { t } = useI18n();
  const a = deliveryAddressOf(client);
  const who = deliveryContactOf(client);
  return (
    <div className={cn('rounded-lg border-l-4 border-amber-500 bg-amber-50 p-3 dark:bg-amber-500/10', className)}>
      <p className="flex items-center gap-1.5 text-xs font-bold tracking-wide text-amber-900 uppercase dark:text-amber-200">
        <Truck className="size-4" /> {t('clients.deliverTo')}
        {!client.deliverySameAsBilling && <span className="rounded bg-amber-500 px-1.5 py-0.5 text-[10px] text-white normal-case">{t('clients.differentFromBilling')}</span>}
      </p>
      <p className={cn('mt-1 break-words text-slate-900 dark:text-white', compact ? 'text-sm' : 'text-base font-medium')}>{formatAddress(a) || '—'}</p>
      {(who.name || who.phone) && <p className="text-xs text-slate-600 dark:text-slate-300">{[who.name, who.phone].filter(Boolean).join(' · ')}</p>}
      {!compact && client.deliveryNotes && !client.deliverySameAsBilling && <p className="mt-1 text-xs text-slate-600 italic dark:text-slate-300">{client.deliveryNotes}</p>}
    </div>
  );
}

function AddressFields({ prefix, value, onChange, errors, disabled }: { prefix: string; value: Address; onChange: (a: Address) => void; errors: ClientErrors; disabled: boolean }) {
  const { t } = useI18n();
  const err = (k: string) => (errors[`${prefix}.${k}`] ? t(errors[`${prefix}.${k}`]!) : undefined);
  const set = (k: keyof Address, v: string) => onChange({ ...value, [k]: v });
  return (
    <div className="grid gap-3 sm:grid-cols-2">
      <Field label={t('clients.addr.line1')} required error={err('line1')} className="sm:col-span-2">
        {(id) => <Input id={id} disabled={disabled} value={value.line1} onChange={(e) => set('line1', e.target.value)} invalid={!!err('line1')} />}
      </Field>
      <Field label={t('clients.addr.line2')} className="sm:col-span-2">
        {(id) => <Input id={id} disabled={disabled} value={value.line2 ?? ''} onChange={(e) => set('line2', e.target.value)} />}
      </Field>
      <Field label={t('clients.addr.city')} required error={err('city')}>
        {(id) => <Input id={id} disabled={disabled} value={value.city} onChange={(e) => set('city', e.target.value)} invalid={!!err('city')} />}
      </Field>
      <Field label={t('clients.addr.postcode')} required error={err('postcode')}>
        {(id) => <Input id={id} disabled={disabled} className="uppercase" value={value.postcode} onChange={(e) => set('postcode', e.target.value)} invalid={!!err('postcode')} />}
      </Field>
      <Field label={t('clients.addr.country')} required error={err('country')} className="sm:col-span-2">
        {(id) => <Input id={id} disabled={disabled} value={value.country} onChange={(e) => set('country', e.target.value)} invalid={!!err('country')} />}
      </Field>
    </div>
  );
}

function ClientDrawer({ open, clientId, onClose }: { open: boolean; clientId?: string; onClose: () => void }) {
  const { t } = useI18n();
  const toast = useToast();
  const canEdit = useCan()('customers.manage');
  const clients = useCollection('clients');
  const client = clientId ? clients.find((c) => c.id === clientId) : undefined;
  const [tab, setTab] = useState<'details' | 'portal'>('details');
  const [d, setD] = useState<ClientDraft>(emptyClient());
  const [errors, setErrors] = useState<ClientErrors>({});
  const [unlocked, setUnlocked] = useState(false);
  const [asking, setAsking] = useState(false);
  const [key, setKey] = useState('');
  const k = `${open}-${clientId ?? 'new'}`;
  if (k !== key) {
    setKey(k);
    setTab('details');
    setErrors({});
    setUnlocked(false);
    setD(client ? { ...emptyClient(), ...client, deliveryAddress: client.deliveryAddress ?? emptyAddress(), legalName: client.legalName ?? '', vatNumber: client.vatNumber ?? '' } : emptyClient());
  }
  // Cliente salvo: tudo travado; "Edit customer data" pede confirmação (dupla checagem).
  const locked = !canEdit || (!!client && !unlocked);
  const set = <K extends keyof ClientDraft>(f: K, v: ClientDraft[K]) => setD((x) => ({ ...x, [f]: v }));
  const err = (f: string) => (errors[f] ? t(errors[f]!) : undefined);

  const submit = (e: FormEvent) => {
    e.preventDefault();
    const errs = validateClient(d, clients, client?.id);
    setErrors(errs);
    if (Object.keys(errs).length) return;
    if (client) clientService.update(client.id, d);
    else clientService.create(d);
    toast.success(t('clients.saved', { name: d.name }));
    onClose();
  };

  return (
    <Drawer
      open={open}
      onClose={onClose}
      width="lg"
      title={client ? client.name : t('clients.new')}
      subtitle={client?.accountNumber}
      footer={
        tab === 'details' && canEdit ? (
          <>
            <Button onClick={onClose}>{t('common.cancel')}</Button>
            {locked ? (
              <Button icon={Pencil} onClick={() => setAsking(true)}>
                {t('clients.editData')}
              </Button>
            ) : (
              <Button variant="primary" icon={Save} type="submit" form="client-form">
                {t('common.save')}
              </Button>
            )}
          </>
        ) : (
          <Button onClick={onClose}>{t('common.close')}</Button>
        )
      }
    >
      {client && (
        <div className="-mt-1 mb-5 flex gap-1 border-b border-slate-200 dark:border-slate-800" role="tablist">
          {(['details', 'portal'] as const).map((x) => (
            <button key={x} role="tab" aria-selected={tab === x} onClick={() => setTab(x)} className={cn('-mb-px border-b-2 px-3 py-2 text-sm font-medium', tab === x ? 'border-brand-500 text-slate-900 dark:text-white' : 'border-transparent text-slate-500')}>
              {t(`clients.tabs.${x}`)}
            </button>
          ))}
        </div>
      )}

      {tab === 'details' && (
        <form id="client-form" onSubmit={submit} className="space-y-6" noValidate>
          {client && <DeliverTo client={client} />}
          {client?.incomplete && (
            <p className="flex items-center gap-2 rounded-lg bg-amber-50 p-3 text-sm text-amber-900 dark:bg-amber-500/10 dark:text-amber-200">
              <TriangleAlert className="size-4 shrink-0" /> {t('clients.incompleteHint')}
            </p>
          )}
          {locked && client && canEdit && (
            <p className="flex items-center gap-2 text-xs text-slate-500">
              <Lock className="size-3.5" /> {t('clients.lockedHint')}
            </p>
          )}
          <fieldset disabled={locked} className="space-y-6">
            <section className="space-y-3">
              <h3 className="text-sm font-semibold tracking-wide text-slate-500 uppercase">{t('clients.sections.company')}</h3>
              <div className="grid gap-3 sm:grid-cols-2">
                <Field label={t('clients.fields.name')} required error={err('name')}>
                  {(id) => <Input id={id} value={d.name} onChange={(e) => set('name', e.target.value)} invalid={!!err('name')} autoFocus={!client} />}
                </Field>
                <Field label={t('clients.fields.accountNumber')} required error={err('accountNumber')}>
                  {(id) => <Input id={id} className="font-mono" value={d.accountNumber} onChange={(e) => set('accountNumber', e.target.value)} invalid={!!err('accountNumber')} />}
                </Field>
                <Field label={t('clients.fields.legalName')}>{(id) => <Input id={id} value={d.legalName ?? ''} onChange={(e) => set('legalName', e.target.value)} />}</Field>
                <Field label={t('clients.fields.vatNumber')}>{(id) => <Input id={id} className="font-mono" value={d.vatNumber ?? ''} onChange={(e) => set('vatNumber', e.target.value)} />}</Field>
              </div>
            </section>

            <section className="space-y-3">
              <h3 className="text-sm font-semibold tracking-wide text-slate-500 uppercase">{t('clients.sections.contact')}</h3>
              <div className="grid gap-3 sm:grid-cols-3">
                <Field label={t('clients.fields.contactName')} required error={err('contactName')}>
                  {(id) => <Input id={id} value={d.contactName} onChange={(e) => set('contactName', e.target.value)} invalid={!!err('contactName')} />}
                </Field>
                <Field label={t('clients.fields.email')} required error={err('email')}>
                  {(id) => <Input id={id} type="email" value={d.email} onChange={(e) => set('email', e.target.value)} invalid={!!err('email')} />}
                </Field>
                <Field label={t('clients.fields.phone')} required error={err('phone')}>
                  {(id) => <Input id={id} type="tel" value={d.phone} onChange={(e) => set('phone', e.target.value)} invalid={!!err('phone')} placeholder="01632 960000" />}
                </Field>
              </div>
            </section>

            <section className="space-y-3">
              <h3 className="text-sm font-semibold tracking-wide text-slate-500 uppercase">{t('clients.sections.billing')}</h3>
              <AddressFields prefix="billing" value={d.billingAddress} onChange={(a) => set('billingAddress', a)} errors={errors} disabled={locked} />
            </section>

            <section className="space-y-3 rounded-lg border-2 border-amber-400/70 p-4">
              <h3 className="flex items-center gap-2 text-sm font-semibold tracking-wide text-amber-800 uppercase dark:text-amber-300">
                <Truck className="size-4" /> {t('clients.sections.delivery')}
              </h3>
              <p className="text-xs text-slate-500">{t('clients.deliveryHint')}</p>
              <label className="flex items-center gap-2 text-sm">
                <input type="checkbox" className="size-4 accent-neutral-900" checked={d.deliverySameAsBilling} onChange={(e) => set('deliverySameAsBilling', e.target.checked)} />
                {t('clients.sameAsBilling')}
              </label>
              {!d.deliverySameAsBilling && (
                <>
                  <AddressFields prefix="delivery" value={d.deliveryAddress ?? emptyAddress()} onChange={(a) => set('deliveryAddress', a)} errors={errors} disabled={locked} />
                  <div className="grid gap-3 sm:grid-cols-2">
                    <Field label={t('clients.fields.deliveryContact')} required error={err('deliveryContact')}>
                      {(id) => <Input id={id} value={d.deliveryContact ?? ''} onChange={(e) => set('deliveryContact', e.target.value)} invalid={!!err('deliveryContact')} />}
                    </Field>
                    <Field label={t('clients.fields.deliveryPhone')} required error={err('deliveryPhone')}>
                      {(id) => <Input id={id} type="tel" value={d.deliveryPhone ?? ''} onChange={(e) => set('deliveryPhone', e.target.value)} invalid={!!err('deliveryPhone')} />}
                    </Field>
                  </div>
                  <Field label={t('clients.fields.deliveryNotes')}>
                    {(id) => <Textarea id={id} rows={2} value={d.deliveryNotes ?? ''} onChange={(e) => set('deliveryNotes', e.target.value)} placeholder={t('clients.deliveryNotesPlaceholder')} />}
                  </Field>
                </>
              )}
            </section>

            <Field label={t('clients.fields.notes')}>{(id) => <Textarea id={id} rows={2} value={d.notes ?? ''} onChange={(e) => set('notes', e.target.value)} />}</Field>
          </fieldset>
          {Object.keys(errors).length > 0 && (
            <p role="alert" className="text-sm text-red-600">
              {t('clients.fixErrors')}
            </p>
          )}
        </form>
      )}

      {tab === 'portal' && client && <PortalAccounts client={client} />}

      <ConfirmDialog
        open={asking}
        danger={false}
        title={t('clients.editTitle', { name: client?.name ?? '' })}
        message={t('clients.editMessage')}
        confirmLabel={t('protected.confirm')}
        onCancel={() => setAsking(false)}
        onConfirm={() => {
          setAsking(false);
          setUnlocked(true);
        }}
      />
    </Drawer>
  );
}

/** Logins do cliente no portal (usuário + senha de 6 dígitos, mostrada uma vez). */
function PortalAccounts({ client }: { client: Client }) {
  const { t } = useI18n();
  const toast = useToast();
  const canEdit = useCan()('customers.manage');
  const all = useCollection('customers');
  const accounts = all.filter((a) => a.clientId === client.id || (!a.clientId && normClientName(a.name) === normClientName(client.name)));
  const [username, setUsername] = useState(suggestUsername(client.name));
  const [email, setEmail] = useState(client.email);
  const [error, setError] = useState('');
  const [shown, setShown] = useState<{ account: CustomerAccount; pin: string }>();
  const [resetting, setResetting] = useState<CustomerAccount>();
  const [deleting, setDeleting] = useState<CustomerAccount>();

  const create = () => {
    const u = username.trim().toLowerCase();
    if (!USERNAME_RE.test(u)) return setError(t('portal.validation.username'));
    if (all.some((a) => a.username === u)) return setError(t('portal.validation.usernameTaken'));
    const r = accountService.create({ clientId: client.id, name: client.name, username: u, email, active: true });
    setError('');
    setShown(r);
  };

  return (
    <div className="space-y-4">
      <p className="text-sm text-slate-500">{t('clients.portalHint')}</p>
      {accounts.length === 0 ? (
        <p className="rounded-lg border border-dashed border-slate-300 p-4 text-center text-sm text-slate-500 dark:border-slate-700">{t('clients.noLogins')}</p>
      ) : (
        <ul className="divide-y divide-slate-100 rounded-lg border border-slate-200 dark:divide-slate-800 dark:border-slate-800">
          {accounts.map((a) => (
            <li key={a.id} className="flex flex-wrap items-center gap-2 px-3 py-2">
              <span className="min-w-0 flex-1">
                <span className="block font-mono font-semibold">{a.username}</span>
                <span className="block text-xs text-slate-500">{a.email ?? '—'}</span>
              </span>
              <Badge tone={a.active ? 'green' : 'slate'} dot>
                {a.active ? t('portal.accounts.active') : t('portal.accounts.inactive')}
              </Badge>
              {canEdit && (
                <>
                  <Button size="sm" variant="ghost" onClick={() => accountService.update(a.id, { name: client.name, username: a.username, email: a.email ?? '', active: !a.active })}>
                    {a.active ? t('clients.deactivate') : t('clients.activate')}
                  </Button>
                  <Button size="sm" variant="ghost" icon={KeyRound} onClick={() => setResetting(a)} aria-label={t('portal.accounts.resetPin')} title={t('portal.accounts.resetPin')} />
                  <Button size="sm" variant="ghost" icon={Trash2} className="text-red-600" onClick={() => setDeleting(a)} aria-label={t('common.delete')} />
                </>
              )}
            </li>
          ))}
        </ul>
      )}
      {canEdit && (
        <section className="space-y-3 rounded-lg bg-slate-50 p-3 dark:bg-slate-800/50">
          <h4 className="text-sm font-semibold">{t('clients.newLogin')}</h4>
          <div className="grid gap-3 sm:grid-cols-2">
            <Field label={t('portal.accounts.username')} hint={t('portal.accounts.usernameHint')}>
              {(id) => <Input id={id} className="font-mono" value={username} onChange={(e) => setUsername(e.target.value.toLowerCase())} />}
            </Field>
            <Field label={t('portal.accounts.email')}>{(id) => <Input id={id} type="email" value={email} onChange={(e) => setEmail(e.target.value)} />}</Field>
          </div>
          {error && <p className="text-sm text-red-600">{error}</p>}
          <Button variant="primary" icon={Plus} onClick={create}>
            {t('portal.accounts.createAndShow')}
          </Button>
        </section>
      )}

      <Modal open={!!shown} onClose={() => setShown(undefined)} title={t('portal.accounts.pinTitle')} footer={<Button variant="primary" onClick={() => setShown(undefined)}>{t('portal.accounts.pinDone')}</Button>}>
        {shown && (
          <div className="space-y-3">
            <p className="text-sm text-slate-600 dark:text-slate-300">{t('portal.accounts.pinOnce', { name: client.name })}</p>
            <dl className="grid grid-cols-[auto_1fr] items-center gap-x-4 gap-y-2 rounded-lg bg-slate-50 p-4 dark:bg-slate-800/60">
              <dt className="text-sm text-slate-500">{t('portal.accounts.username')}</dt>
              <dd className="font-mono text-lg font-semibold">{shown.account.username}</dd>
              <dt className="text-sm text-slate-500">{t('portal.accounts.pin')}</dt>
              <dd className="font-mono text-2xl font-bold tracking-[0.3em]">{shown.pin}</dd>
            </dl>
            <Button
              icon={Copy}
              onClick={() => {
                void navigator.clipboard?.writeText(`${t('portal.accounts.username')}: ${shown.account.username}\n${t('portal.accounts.pin')}: ${shown.pin}`);
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
          setShown({ account: a, pin: accountService.resetPin(a.id) });
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
    </div>
  );
}
