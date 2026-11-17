/**
 * Cadastro único de clientes (`clients`). Regras:
 * - todos os dados possíveis são obrigatórios: nome, nº de conta, endereço de cobrança, contato, e-mail, telefone e — se
 *   for diferente — o ENDEREÇO DE ENTREGA com contato e telefone de quem recebe (é o que a Logística usa);
 * - renomear o cliente atualiza o nome copiado em projetos, spindles, forecast e contas do portal;
 * - editar um cliente já salvo passa por confirmação na tela (dupla checagem).
 */
import { assertCan } from '@/app/session';
import { repos } from '@/data/db';
import type { TranslationKey } from '@/i18n/types';
import { newId } from '@/lib/id';
import type { Address, Client } from '@/types/models';

export const normClientName = (s: string) => s.trim().toLowerCase().replace(/\s+/g, ' ');

export const emptyAddress = (): Address => ({ line1: '', line2: '', city: '', postcode: '', country: 'United Kingdom' });

export type ClientDraft = Omit<Client, 'id' | 'createdAt' | 'incomplete'>;

export const emptyClient = (): ClientDraft => ({
  name: '',
  accountNumber: '',
  legalName: '',
  vatNumber: '',
  billingAddress: emptyAddress(),
  deliverySameAsBilling: true,
  deliveryAddress: emptyAddress(),
  deliveryContact: '',
  deliveryPhone: '',
  deliveryNotes: '',
  contactName: '',
  email: '',
  phone: '',
  notes: '',
});

export type ClientErrors = Partial<Record<string, TranslationKey>>;

const addressErrors = (a: Address | undefined, prefix: string, e: ClientErrors) => {
  if (!a?.line1.trim()) e[`${prefix}.line1`] = 'clients.validation.required';
  if (!a?.city.trim()) e[`${prefix}.city`] = 'clients.validation.required';
  if (!a?.postcode.trim()) e[`${prefix}.postcode`] = 'clients.validation.required';
  if (!a?.country.trim()) e[`${prefix}.country`] = 'clients.validation.required';
};

export function validateClient(d: ClientDraft, all: readonly Client[], selfId?: string): ClientErrors {
  const e: ClientErrors = {};
  if (!d.name.trim()) e.name = 'clients.validation.required';
  else if (all.some((c) => c.id !== selfId && normClientName(c.name) === normClientName(d.name))) e.name = 'clients.validation.nameTaken';
  if (!d.accountNumber.trim()) e.accountNumber = 'clients.validation.required';
  if (!d.contactName.trim()) e.contactName = 'clients.validation.required';
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(d.email.trim())) e.email = 'clients.validation.email';
  if (d.phone.replace(/\D/g, '').length < 8) e.phone = 'clients.validation.phone';
  addressErrors(d.billingAddress, 'billing', e);
  if (!d.deliverySameAsBilling) {
    addressErrors(d.deliveryAddress, 'delivery', e);
    if (!d.deliveryContact?.trim()) e.deliveryContact = 'clients.validation.required';
    if ((d.deliveryPhone ?? '').replace(/\D/g, '').length < 8) e.deliveryPhone = 'clients.validation.phone';
  }
  return e;
}

const cleanAddr = (a: Address | undefined): Address => ({
  line1: a?.line1.trim() ?? '',
  line2: a?.line2?.trim() || undefined,
  city: a?.city.trim() ?? '',
  postcode: a?.postcode.trim().toUpperCase() ?? '',
  country: a?.country.trim() ?? '',
});

function clean(d: ClientDraft): ClientDraft {
  return {
    ...d,
    name: d.name.trim(),
    accountNumber: d.accountNumber.trim(),
    legalName: d.legalName?.trim() || undefined,
    vatNumber: d.vatNumber?.trim() || undefined,
    billingAddress: cleanAddr(d.billingAddress),
    deliveryAddress: d.deliverySameAsBilling ? undefined : cleanAddr(d.deliveryAddress),
    deliveryContact: d.deliveryContact?.trim() || undefined,
    deliveryPhone: d.deliveryPhone?.trim() || undefined,
    deliveryNotes: d.deliveryNotes?.trim() || undefined,
    contactName: d.contactName.trim(),
    email: d.email.trim(),
    phone: d.phone.trim(),
    notes: d.notes?.trim() || undefined,
  };
}

/** Atualiza o nome copiado nos registros ligados ao cliente. */
function propagateName(client: Client, oldName: string) {
  const match = (id?: string, name?: string) => id === client.id || (!id && name !== undefined && normClientName(name) === normClientName(oldName));
  for (const p of repos.projects.getAll()) if (match(p.clientId, p.customer) && (p.customer !== client.name || p.clientId !== client.id)) repos.projects.update(p.id, { customer: client.name, clientId: client.id });
  for (const s of repos.spindles.getAll()) if (match(s.clientId, s.customer) && (s.customer !== client.name || s.clientId !== client.id)) repos.spindles.update(s.id, { customer: client.name, clientId: client.id });
  for (const f of repos.forecast.getAll()) if (match(f.clientId, f.customer) && (f.customer !== client.name || f.clientId !== client.id)) repos.forecast.update(f.id, { customer: client.name, clientId: client.id });
  for (const a of repos.customers.getAll()) if (match(a.clientId, a.name) && (a.name !== client.name || a.clientId !== client.id)) repos.customers.update(a.id, { name: client.name, clientId: client.id });
}

export const clientService = {
  create(d: ClientDraft): Client {
    assertCan('customers.manage');
    const c: Client = { id: newId('cli'), ...clean(d), createdAt: new Date().toISOString() };
    repos.clients.create(c);
    propagateName(c, c.name);
    return c;
  },
  update(id: string, d: ClientDraft): Client {
    assertCan('customers.manage');
    const old = repos.clients.getById(id);
    const c = repos.clients.update(id, { ...clean(d), incomplete: undefined });
    propagateName(c, old?.name ?? c.name);
    return c;
  },
};

/** Cliente pelo nome (sem diferenciar maiúsculas/espaços). */
export const findClientByName = (name: string | undefined, clients: readonly Client[]) =>
  name?.trim() ? clients.find((c) => normClientName(c.name) === normClientName(name)) : undefined;

/** Endereço de ENTREGA efetivo (o de cobrança quando é o mesmo). */
export const deliveryAddressOf = (c: Client): Address => (c.deliverySameAsBilling || !c.deliveryAddress ? c.billingAddress : c.deliveryAddress);
export const deliveryContactOf = (c: Client) => (c.deliverySameAsBilling ? { name: c.contactName, phone: c.phone } : { name: c.deliveryContact ?? '', phone: c.deliveryPhone ?? '' });

export const formatAddress = (a: Address | undefined, sep = ', ') => (a ? [a.line1, a.line2, a.city, a.postcode, a.country].filter(Boolean).join(sep) : '');
