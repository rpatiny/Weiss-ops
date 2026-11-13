/**
 * Exportação Excel (multi-abas) e Backup/Restore JSON com validação de estrutura.
 * Excel: abas e cabeçalhos em pt-BR (padrão da empresa); datas como datas do Excel; valores derivados incluídos.
 */
import { getCurrentUser, logout } from '@/app/session';
import { db } from '@/data/db';
import { translate } from '@/i18n';
import type { TranslationKey } from '@/i18n/types';
import { APP_CONFIG } from '@/lib/config';
import { businessDaysBetween, parseISODate, todayISO } from '@/lib/dates';
import type { AppDatabase, CollectionName } from '@/types/models';
import { billedValue, weightedValue } from './financial';
import { lineTotal, poTotal } from './purchasing';
import { materialStatus } from './schedule';

const label = (key: string) => translate('pt-BR', key as TranslationKey);
const d = (iso?: string) => (iso ? parseISODate(iso) : undefined);

/** Linhas de cada aba (objetos simples → colunas). */
export function buildWorkbookSheets(data: AppDatabase): Record<string, Record<string, unknown>[]> {
  const emp = new Map(data.employees.map((e) => [e.id, e]));
  const prj = new Map(data.projects.map((p) => [p.id, p]));
  const po = new Map(data.purchaseOrders.map((p) => [p.id, p]));
  const sp = new Map(data.spindles.map((s) => [s.id, s]));
  const sup = new Map(data.suppliers.map((s) => [s.id, s]));
  const usr = new Map(data.users.map((u) => [u.id, u]));
  const rc = new Map(data.requisitions.map((r) => [r.id, r]));

  return {
    Colaboradores: data.employees.map((e) => ({
      ID: e.id,
      Nome: e.name,
      Cargo: e.role,
      Telefone: e.phone,
      'E-mail': e.email,
      Cor: e.color,
      Status: label(`enums.employeeStatus.${e.status}`),
    })),
    Agenda_Rotas: data.assignments
      .map((a) => {
        const p = prj.get(a.projectId);
        return {
          'Nº projeto': p?.projectNumber ?? '',
          Cliente: p?.customer ?? '',
          Endereço: p?.address ?? '',
          'Tipo de serviço': p ? label(`enums.serviceType.${p.serviceType}`) : '',
          Descrição: p?.description ?? '',
          Colaborador: emp.get(a.employeeId)?.name ?? a.employeeId,
          Início: d(a.startDate),
          Fim: d(a.endDate),
          'Dias úteis': businessDaysBetween(a.startDate, a.endDate),
          'Status do projeto': p ? label(`enums.projectStatus.${p.status}`) : '',
          'PO do cliente': p?.poId ? (po.get(p.poId)?.poNumber ?? '') : '',
          'Spindle / motor': p?.spindleId ? (sp.get(p.spindleId)?.serialNumber ?? '') : '',
        };
      })
      .sort((x, y) => String(x['Nº projeto']).localeCompare(String(y['Nº projeto']))),
    Ordens_Compra: data.purchaseOrders.map((p) => ({
      'Nº PO': p.poNumber,
      Tipo: label(`enums.poKind.${p.kind}`),
      'Cliente / fornecedor': p.customerOrVendor,
      'Data do pedido': d(p.orderDate),
      Solicitante: p.requester,
      'Condição de pagamento': p.paymentTerms,
      Status: label(`enums.poStatus.${p.status}`),
      'Total da PO': poTotal(p),
      Linhas: p.lines.length,
      Requisição: p.requisitionId ? (rc.get(p.requisitionId)?.number ?? '') : '',
      Observações: p.notes,
      Anexos: p.attachments.map((a) => `${a.name} <${a.url}>`).join('; '),
    })),
    Itens_PO: data.purchaseOrders.flatMap((p) =>
      p.lines.map((l) => {
        const received = (l.receipts ?? []).reduce((s, r) => s + r.quantity, 0);
        return {
          'Nº PO': p.poNumber,
          Linha: l.lineNumber,
          'Part number': l.partNumber,
          Descrição: l.description,
          Quantidade: l.quantity,
          'Preço unitário': l.unitPrice,
          'Total da linha': lineTotal(l),
          'Entrega prevista': d(l.expectedDeliveryDate),
          'Entrega real': d(l.actualDeliveryDate),
          Status: label(`enums.poLineStatus.${l.status}`),
          'Qtd. recebida (GR)': received,
          'Docs. GR (SAP)': (l.receipts ?? []).map((r) => r.grNumber).join(', '),
          Atrasada: l.status !== 'delivered' && l.status !== 'canceled' && l.expectedDeliveryDate < todayISO() ? 'Sim' : 'Não',
        };
      }),
    ),
    Spindles: data.spindles.map((s) => ({
      'Nº de série': s.serialNumber,
      Fabricante: s.manufacturer,
      Modelo: s.model,
      Cliente: s.customer,
      Recebido: d(s.receivedDate),
      'Nº cotação': s.quoteNumber,
      'Valor cotado': s.quotedValue,
      'Status da cotação': label(`enums.quoteStatus.${s.quoteStatus}`),
      Status: label(`enums.spindleStatus.${s.status}`),
      Entrega: d(s.deliveryDate),
      'Valor faturado': s.status === 'delivered' ? billedValue(s) : undefined,
      PO: s.poId ? (po.get(s.poId)?.poNumber ?? '') : '',
    })),
    Forecast: data.forecast.map((f) => ({
      Cliente: f.customer,
      'Spindle / modelo': f.spindleModel,
      Descrição: f.description,
      'Valor estimado': f.estimatedValue,
      'Data prevista': d(f.expectedDate),
      'Probabilidade (%)': f.probability,
      'Valor ponderado': weightedValue(f),
    })),
    Materiais_Projeto: data.projects.flatMap((p) =>
      p.materials.map((m) => {
        const st = materialStatus(m, po);
        return {
          'Nº projeto': p.projectNumber,
          Cliente: p.customer,
          'Part number': m.partNumber,
          Descrição: m.description,
          Quantidade: m.quantity,
          'Necessário em': d(m.neededBy),
          Status: label(`enums.materialStatus.${st.status}`),
          Requisição: m.requisitionId ? (rc.get(m.requisitionId)?.number ?? '') : '',
          PO: st.po?.poNumber ?? '',
          'Previsão de chegada': d(st.line?.expectedDeliveryDate),
        };
      }),
    ),
    Requisicoes: data.requisitions.flatMap((r) =>
      r.items.map((it) => ({
        Requisição: r.number,
        Projeto: prj.get(r.projectId)?.projectNumber ?? '',
        'Solicitado por': usr.get(r.requestedBy)?.name ?? '',
        'Data': d(r.requestedAt),
        'Necessário até': d(r.neededBy),
        'Status (registrado)': label(`enums.requisitionStatus.${r.status}`),
        'Part number': it.partNumber,
        Descrição: it.description,
        Quantidade: it.quantity,
      })),
    ),
    Extensoes: data.extensions.map((x) => ({
      Pedido: x.number,
      'Part number': x.partNumber,
      Descrição: x.description,
      De: x.fromPlant,
      Para: x.toPlant,
      Fornecedor: x.supplierId ? (sup.get(x.supplierId)?.name ?? '') : '',
      Projeto: x.projectId ? (prj.get(x.projectId)?.projectNumber ?? '') : '',
      'Solicitado por': usr.get(x.requestedBy)?.name ?? '',
      Data: d(x.requestedAt),
      'Necessário até': d(x.neededBy),
      Status: label(`enums.extensionStatus.${x.status}`),
      'Referência SAP': x.sapReference ?? '',
    })),
    Fornecedores: data.suppliers.map((s) => ({ Nome: s.name, Contato: s.contactName, 'E-mail': s.email, Telefone: s.phone, Observações: s.notes })),
    Catalogo: data.materials.flatMap((m) =>
      (m.offers.length ? m.offers : [undefined]).map((o) => ({
        'Part number': m.partNumber,
        Descrição: m.description,
        Unidade: m.unit,
        'Plantas SAP': (m.plants ?? []).join(', '),
        Fornecedor: o ? (sup.get(o.supplierId)?.name ?? '') : '',
        Cotação: o ? label(`enums.supplierQuoteStatus.${o.quoteStatus}`) : '',
        'Preço cotado': o?.quotedPrice,
        'Validade': d(o?.validUntil),
        'Prazo (dias)': o?.leadTimeDays,
      })),
    ),
    Ferias_Ausencias: data.absences.map((a) => ({
      Colaborador: emp.get(a.employeeId)?.name ?? '',
      Tipo: label(`enums.absenceType.${a.type}`),
      Início: d(a.startDate),
      Fim: d(a.endDate),
      'Dias úteis': businessDaysBetween(a.startDate, a.endDate),
      Observação: a.note,
    })),
  };
}

function triggerDownload(blob: Blob, filename: string) {
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 2000);
}

/** Gera e baixa o .xlsx (biblioteca carregada sob demanda). */
export async function exportExcel(): Promise<string> {
  const XLSX = await import('xlsx');
  const wb = XLSX.utils.book_new();
  for (const [name, rows] of Object.entries(buildWorkbookSheets(db.snapshot()))) {
    const ws = XLSX.utils.json_to_sheet(rows.length ? rows : [{}], { cellDates: true, dateNF: 'dd/mm/yyyy' });
    const headers = Object.keys(rows[0] ?? {});
    ws['!cols'] = headers.map((h) => ({ wch: Math.min(48, Math.max(h.length, ...rows.map((r) => String(r[h] instanceof Date ? '00/00/0000' : (r[h] ?? '')).length)) + 2) }));
    XLSX.utils.book_append_sheet(wb, ws, name.slice(0, 31));
  }
  const filename = `spindleops_${todayISO()}.xlsx`;
  const out = XLSX.write(wb, { bookType: 'xlsx', type: 'array', cellDates: true });
  triggerDownload(new Blob([out], { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' }), filename);
  return filename;
}

// ───────────── Backup JSON ─────────────

export interface BackupFile {
  app: string;
  schemaVersion: number;
  exportedAt: string;
  data: AppDatabase;
}

export function exportBackup(): string {
  const payload: BackupFile = { app: APP_CONFIG.appName, schemaVersion: APP_CONFIG.schemaVersion, exportedAt: new Date().toISOString(), data: db.snapshot() };
  const filename = `spindleops_backup_${todayISO()}.json`;
  triggerDownload(new Blob([JSON.stringify(payload, null, 2)], { type: 'application/json' }), filename);
  return filename;
}

export interface BackupIssue {
  key: TranslationKey;
  vars?: Record<string, string | number>;
}

export interface BackupCheck {
  ok: boolean;
  issues: BackupIssue[];
  file?: BackupFile;
  counts?: Record<CollectionName, number>;
}

type FieldRule = [field: string, kind: 'string' | 'number' | 'array' | 'date' | 'boolean'];

/** Campos obrigatórios mínimos por coleção (garante que as telas funcionem após a restauração). */
const RULES: Record<CollectionName, FieldRule[]> = {
  users: [['name', 'string'], ['role', 'string'], ['pinHash', 'string'], ['active', 'boolean']],
  requisitions: [['number', 'string'], ['projectId', 'string'], ['status', 'string'], ['items', 'array'], ['history', 'array']],
  extensions: [['number', 'string'], ['partNumber', 'string'], ['fromPlant', 'string'], ['toPlant', 'string'], ['status', 'string'], ['history', 'array']],
  employees: [['name', 'string'], ['color', 'string'], ['status', 'string']],
  projects: [['projectNumber', 'string'], ['customer', 'string'], ['status', 'string'], ['color', 'string'], ['materials', 'array']],
  assignments: [['projectId', 'string'], ['employeeId', 'string'], ['startDate', 'date'], ['endDate', 'date']],
  absences: [['employeeId', 'string'], ['type', 'string'], ['startDate', 'date'], ['endDate', 'date']],
  purchaseOrders: [['poNumber', 'string'], ['kind', 'string'], ['customerOrVendor', 'string'], ['orderDate', 'date'], ['status', 'string'], ['lines', 'array'], ['attachments', 'array']],
  suppliers: [['name', 'string']],
  materials: [['partNumber', 'string'], ['description', 'string'], ['offers', 'array']],
  spindles: [['serialNumber', 'string'], ['customer', 'string'], ['receivedDate', 'date'], ['quotedValue', 'number'], ['quoteStatus', 'string'], ['status', 'string']],
  forecast: [['customer', 'string'], ['estimatedValue', 'number'], ['expectedDate', 'date'], ['probability', 'number']],
};

const ISO_RE = /^\d{4}-\d{2}-\d{2}$/;
const okType = (v: unknown, kind: FieldRule[1]) =>
  kind === 'array' ? Array.isArray(v) : kind === 'date' ? typeof v === 'string' && ISO_RE.test(v) : typeof v === kind && (kind !== 'number' || Number.isFinite(v));

/** Valida o JSON de backup: formato, versão, coleções, campos, IDs únicos e referências. */
export function checkBackup(text: string): BackupCheck {
  const issues: BackupIssue[] = [];
  let parsed: unknown;
  try {
    parsed = JSON.parse(text);
  } catch {
    return { ok: false, issues: [{ key: 'dataio.errors.notJson' }] };
  }
  const f = parsed as Partial<BackupFile>;
  if (!f || typeof f !== 'object' || f.app !== APP_CONFIG.appName || typeof f.data !== 'object' || !f.data) return { ok: false, issues: [{ key: 'dataio.errors.notBackup' }] };
  if (f.schemaVersion !== APP_CONFIG.schemaVersion) issues.push({ key: 'dataio.errors.version', vars: { found: String(f.schemaVersion), expected: APP_CONFIG.schemaVersion } });

  const data = f.data as unknown as Record<string, unknown>;
  const ids = {} as Record<CollectionName, Set<string>>;
  for (const name of Object.keys(RULES) as CollectionName[]) {
    const list = data[name];
    ids[name] = new Set();
    if (!Array.isArray(list)) {
      issues.push({ key: 'dataio.errors.missing', vars: { name } });
      continue;
    }
    list.forEach((item, i) => {
      const it = item as Record<string, unknown>;
      if (!it || typeof it !== 'object' || typeof it.id !== 'string') return issues.push({ key: 'dataio.errors.item', vars: { name, index: i + 1, field: 'id' } });
      if (ids[name].has(it.id)) issues.push({ key: 'dataio.errors.duplicate', vars: { name, id: it.id } });
      ids[name].add(it.id);
      for (const [field, kind] of RULES[name]) if (!okType(it[field], kind)) issues.push({ key: 'dataio.errors.item', vars: { name, index: i + 1, field } });
    });
  }

  if (!issues.some((x) => x.key === 'dataio.errors.missing')) {
    const db_ = f.data as AppDatabase;
    const ref = (name: CollectionName, list: { id: string }[], field: string, target: CollectionName, optional = false) =>
      list.forEach((it, i) => {
        const v = (it as unknown as Record<string, unknown>)[field];
        if (v === undefined && optional) return;
        if (typeof v !== 'string' || !ids[target].has(v)) issues.push({ key: 'dataio.errors.reference', vars: { name, index: i + 1, field } });
      });
    ref('assignments', db_.assignments, 'projectId', 'projects');
    ref('assignments', db_.assignments, 'employeeId', 'employees');
    ref('absences', db_.absences, 'employeeId', 'employees');
    ref('requisitions', db_.requisitions, 'projectId', 'projects');
    ref('spindles', db_.spindles, 'poId', 'purchaseOrders', true);
    ref('projects', db_.projects, 'poId', 'purchaseOrders', true);
    ref('projects', db_.projects, 'spindleId', 'spindles', true);
    if (!db_.users.some((u) => u.role === 'master' && u.active)) issues.push({ key: 'dataio.errors.noMaster' });
  }

  const ok = issues.length === 0;
  const counts = Object.fromEntries((Object.keys(RULES) as CollectionName[]).map((n) => [n, Array.isArray(data[n]) ? (data[n] as unknown[]).length : 0])) as Record<CollectionName, number>;
  return { ok, issues, file: ok ? (f as BackupFile) : undefined, counts };
}

/** Substitui todos os dados pelos do backup (já validado). Sai da sessão se o usuário atual não existir mais. */
export function restoreBackup(file: BackupFile): void {
  const me = getCurrentUser();
  db.load(file.data, 'import');
  if (me && !file.data.users.some((u) => u.id === me.id && u.active)) logout();
}
