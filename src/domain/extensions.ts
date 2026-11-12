/**
 * Extensão de material no SAP: o material existe numa planta (ex.: DE01, fornecedor alemão)
 * mas ainda não foi estendido para a planta que compra (HOME_PLANT, ex.: UK01).
 * Sem a extensão a logística não consegue criar a PO no SAP.
 */
import { assertCan, can, getCurrentUser } from '@/app/session';
import { repos } from '@/data/db';
import type { TranslationKey } from '@/i18n/types';
import { HOME_PLANT } from '@/lib/config';
import { todayISO } from '@/lib/dates';
import { newId } from '@/lib/id';
import type { CatalogMaterial, ExtensionEvent, MaterialExtensionRequest } from '@/types/models';
import { normPN } from './purchasing';

const nowStamp = () => new Date().toISOString().slice(0, 19);

export const isExtensionOpen = (x: MaterialExtensionRequest) => x.status === 'requested' || x.status === 'in_progress';

/**
 * Situação do material na planta:
 * - `ok`: estendido · `pending`: há pedido de extensão em aberto · `missing`: não estendido
 * - `unknown`: material fora do catálogo ou sem plantas informadas (sem alerta)
 */
export type PlantState = 'ok' | 'pending' | 'missing' | 'unknown';

export function plantState(
  partNumber: string,
  catalogByPN: ReadonlyMap<string, CatalogMaterial>,
  extensions: readonly MaterialExtensionRequest[],
  plant = HOME_PLANT,
): { state: PlantState; request?: MaterialExtensionRequest } {
  const key = normPN(partNumber);
  const request = extensions.find((x) => normPN(x.partNumber) === key && x.toPlant === plant && isExtensionOpen(x));
  const cat = catalogByPN.get(key);
  if (cat?.plants?.includes(plant)) return { state: 'ok' };
  if (request) return { state: 'pending', request };
  if (!cat?.plants?.length) return { state: 'unknown' };
  return { state: 'missing' };
}

export function nextExtensionNumber(): string {
  const used = new Set(repos.extensions.getAll().map((x) => x.number));
  let n = repos.extensions.getAll().length + 1;
  let num = `EXT-${String(n).padStart(5, '0')}`;
  while (used.has(num)) num = `EXT-${String(++n).padStart(5, '0')}`;
  return num;
}

export type ExtensionDraft = Pick<MaterialExtensionRequest, 'partNumber' | 'description' | 'supplierId' | 'fromPlant' | 'toPlant' | 'projectId' | 'neededBy' | 'notes'>;

export function validateExtension(d: ExtensionDraft): Partial<Record<keyof ExtensionDraft, TranslationKey>> {
  const e: Partial<Record<keyof ExtensionDraft, TranslationKey>> = {};
  if (!d.partNumber.trim()) e.partNumber = 'purchasing.validation.partNumberRequired';
  if (!d.description.trim()) e.description = 'purchasing.validation.descriptionRequired';
  if (!d.fromPlant.trim() || !d.toPlant.trim()) e.toPlant = 'extensions.validation.plantsRequired';
  else if (d.fromPlant.trim().toUpperCase() === d.toPlant.trim().toUpperCase()) e.toPlant = 'extensions.validation.samePlant';
  return e;
}

function addEvent(id: string, userId: string, action: ExtensionEvent['action'], note = '') {
  const x = repos.extensions.getById(id);
  if (x) repos.extensions.update(id, { history: [...x.history, { at: nowStamp(), userId, action, note }] });
}

export const extensionService = {
  create(d: ExtensionDraft): MaterialExtensionRequest {
    const user = assertCan('extension.request');
    const x: MaterialExtensionRequest = {
      id: newId('ext'),
      number: nextExtensionNumber(),
      partNumber: d.partNumber.trim(),
      description: d.description.trim(),
      supplierId: d.supplierId || undefined,
      fromPlant: d.fromPlant.trim().toUpperCase(),
      toPlant: d.toPlant.trim().toUpperCase(),
      projectId: d.projectId || undefined,
      requestedBy: user.id,
      requestedAt: todayISO(),
      neededBy: d.neededBy || undefined,
      status: 'requested',
      notes: d.notes.trim(),
      history: [{ at: nowStamp(), userId: user.id, action: 'requested', note: '' }],
    };
    return repos.extensions.create(x);
  },

  start(id: string, note = ''): void {
    const user = assertCan('extension.process');
    repos.extensions.update(id, { status: 'in_progress' });
    addEvent(id, user.id, 'started', note);
  },

  /** Conclui: registra a referência do SAP e adiciona a planta ao material no catálogo. */
  complete(id: string, sapReference: string, note = ''): void {
    const user = assertCan('extension.process');
    const x = repos.extensions.getById(id);
    if (!x) return;
    repos.extensions.update(id, { status: 'extended', sapReference: sapReference.trim() || undefined });
    addEvent(id, user.id, 'extended', [sapReference.trim(), note.trim()].filter(Boolean).join(' · '));
    const cat = repos.materials.getAll().find((m) => normPN(m.partNumber) === normPN(x.partNumber));
    if (cat) {
      const plants = [...new Set([...(cat.plants ?? [x.fromPlant]), x.toPlant])];
      repos.materials.update(cat.id, { plants });
    } else {
      repos.materials.create({
        id: newId('cm'),
        partNumber: x.partNumber,
        description: x.description,
        unit: 'un',
        offers: x.supplierId ? [{ supplierId: x.supplierId, quoteStatus: 'not_requested', leadTimeDays: 7 }] : [],
        plants: [x.fromPlant, x.toPlant],
      });
    }
  },

  reject(id: string, reason: string): void {
    const user = assertCan('extension.process');
    repos.extensions.update(id, { status: 'rejected' });
    addEvent(id, user.id, 'rejected', reason);
  },

  comment(id: string, note: string): void {
    const user = getCurrentUser();
    if (!user || !(can('extension.request', user) || can('extension.process', user))) throw new Error('auth.forbidden');
    addEvent(id, user.id, 'comment', note);
  },
};
