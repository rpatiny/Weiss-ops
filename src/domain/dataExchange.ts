/**
 * Exportação Excel (multi-abas) e Backup/Restore JSON com validação de estrutura.
 * Excel: abas e cabeçalhos em pt-BR (padrão da empresa); datas como datas do Excel; valores derivados incluídos.
 */
import { getCurrentUser, logout } from '@/app/session';
import { EMAIL_AUTH, db } from '@/data/db';
import { translate } from '@/i18n';
import type { TranslationKey } from '@/i18n/types';
import { APP_CONFIG } from '@/lib/config';
import { businessDaysBetween, parseISODate, todayISO } from '@/lib/dates';
import type { AppDatabase, CollectionName } from '@/types/models';
import { billedValue, spindlePoRef, weightedValue } from './financial';
import { lineTotal, poTotal } from './purchasing';
import { materialStatus, projectPoRef, projectSpindleRef } from './schedule';
import { entryMinutes, localDay } from './timeTracking';
import { reportCheck } from './hoursReport';

const label = (key: string) => translate('en-GB', key as TranslationKey);
const d = (iso?: string) => (iso ? parseISODate(iso) : undefined);
/** Hora local HH:MM de um instante ISO. */
const hhmm = (iso: string) => {
  const t = new Date(iso);
  return `${String(t.getHours()).padStart(2, '0')}:${String(t.getMinutes()).padStart(2, '0')}`;
};

/** Linhas de cada aba (objetos simples → colunas). */
export function buildWorkbookSheets(data: AppDatabase): Record<string, Record<string, unknown>[]> {
  const emp = new Map(data.employees.map((e) => [e.id, e]));
  const prj = new Map(data.projects.map((p) => [p.id, p]));
  const po = new Map(data.purchaseOrders.map((p) => [p.id, p]));
  const sp = new Map(data.spindles.map((s) => [s.id, s]));
  const sup = new Map(data.suppliers.map((s) => [s.id, s]));
  const usr = new Map(data.users.map((u) => [u.id, u]));
  const rc = new Map(data.requisitions.map((r) => [r.id, r]));
  const phases = new Map(data.workPhases.map((p) => [p.id, p]));

  return {
    Employees: data.employees.map((e) => ({
      ID: e.id,
      Name: e.name,
      Role: e.role,
      Phone: e.phone,
      Email: e.email,
      Colour: e.color,
      Status: label(`enums.employeeStatus.${e.status}`),
    })),
    Schedule: data.assignments
      .map((a) => {
        const p = prj.get(a.projectId);
        return {
          'Project no.': p?.projectNumber ?? '',
          Customer: p?.customer ?? '',
          Address: p?.address ?? '',
          'Service type': p ? label(`enums.serviceType.${p.serviceType}`) : '',
          Description: p?.description ?? '',
          Employee: emp.get(a.employeeId)?.name ?? a.employeeId,
          Start: d(a.startDate),
          End: d(a.endDate),
          'Working days': businessDaysBetween(a.startDate, a.endDate),
          'Project status': p ? label(`enums.projectStatus.${p.status}`) : '',
          'Customer PO': p ? projectPoRef(p, po) : '',
          'Spindle / motor': p ? projectSpindleRef(p, sp) : '',
        };
      })
      .sort((x, y) => String(x['Project no.']).localeCompare(String(y['Project no.']))),
    Purchase_Orders: data.purchaseOrders.map((p) => ({
      'PO no.': p.poNumber,
      Type: label(`enums.poKind.${p.kind}`),
      'Customer / supplier': p.customerOrVendor,
      'Order date': d(p.orderDate),
      Requester: p.requester,
      'Payment terms': p.paymentTerms,
      Status: label(`enums.poStatus.${p.status}`),
      'PO total': poTotal(p),
      Lines: p.lines.length,
      Requisition: p.requisitionId ? (rc.get(p.requisitionId)?.number ?? '') : '',
      Notes: p.notes,
      Attachments: p.attachments.map((a) => `${a.name} <${a.url}>`).join('; '),
    })),
    PO_Lines: data.purchaseOrders.flatMap((p) =>
      p.lines.map((l) => {
        const received = (l.receipts ?? []).reduce((s, r) => s + r.quantity, 0);
        return {
          'PO no.': p.poNumber,
          Line: l.lineNumber,
          'Part number': l.partNumber,
          Description: l.description,
          Quantity: l.quantity,
          'Unit price': l.unitPrice,
          'Line total': lineTotal(l),
          'Expected delivery': d(l.expectedDeliveryDate),
          'Actual delivery': d(l.actualDeliveryDate),
          Status: label(`enums.poLineStatus.${l.status}`),
          'Qty received (GR)': received,
          'GR docs (SAP)': (l.receipts ?? []).map((r) => r.grNumber).join(', '),
          Late: l.status !== 'delivered' && l.status !== 'canceled' && l.expectedDeliveryDate < todayISO() ? 'Yes' : 'No',
        };
      }),
    ),
    Spindles: data.spindles.map((s) => ({
      'Serial no.': s.serialNumber,
      Manufacturer: s.manufacturer,
      Model: s.model,
      Customer: s.customer,
      Received: d(s.receivedDate),
      'Quote no.': s.quoteNumber,
      'Quote date': d(s.quoteDate),
      'Quoted value': s.quotedValue,
      'Quote status': label(`enums.quoteStatus.${s.quoteStatus}`),
      Status: label(`enums.spindleStatus.${s.status}`),
      Delivery: d(s.deliveryDate),
      'Invoiced value': s.status === 'delivered' ? billedValue(s) : undefined,
      PO: spindlePoRef(s, po),
    })),
    Forecast: data.forecast.map((f) => ({
      Customer: f.customer,
      'Spindle / model': f.spindleModel,
      Description: f.description,
      'Estimated value': f.estimatedValue,
      'Expected date': d(f.expectedDate),
      'Probability (%)': f.probability,
      'Weighted value': weightedValue(f),
    })),
    Project_Materials: data.projects.flatMap((p) =>
      p.materials.map((m) => {
        const st = materialStatus(m, po);
        return {
          'Project no.': p.projectNumber,
          Customer: p.customer,
          'Part number': m.partNumber,
          Description: m.description,
          Quantity: m.quantity,
          'Needed by': d(m.neededBy),
          Status: label(`enums.materialStatus.${st.status}`),
          Requisition: m.requisitionId ? (rc.get(m.requisitionId)?.number ?? '') : '',
          PO: st.po?.poNumber ?? '',
          'Expected arrival': d(st.line?.expectedDeliveryDate),
        };
      }),
    ),
    Requisitions: data.requisitions.flatMap((r) =>
      r.items.map((it) => ({
        Requisition: r.number,
        Project: prj.get(r.projectId)?.projectNumber ?? '',
        'Requested by': usr.get(r.requestedBy)?.name ?? '',
        Date: d(r.requestedAt),
        'Needed by': d(r.neededBy),
        'Status (recorded)': label(`enums.requisitionStatus.${r.status}`),
        'Part number': it.partNumber,
        Description: it.description,
        Quantity: it.quantity,
      })),
    ),
    Extensions: data.extensions.map((x) => ({
      Request: x.number,
      'Part number': x.partNumber,
      Description: x.description,
      From: x.fromPlant,
      To: x.toPlant,
      Supplier: x.supplierId ? (sup.get(x.supplierId)?.name ?? '') : '',
      Project: x.projectId ? (prj.get(x.projectId)?.projectNumber ?? '') : '',
      'Requested by': usr.get(x.requestedBy)?.name ?? '',
      Date: d(x.requestedAt),
      'Needed by': d(x.neededBy),
      Status: label(`enums.extensionStatus.${x.status}`),
      'SAP reference': x.sapReference ?? '',
    })),
    Suppliers: data.suppliers.map((s) => ({ Name: s.name, Contact: s.contactName, Email: s.email, Phone: s.phone, Notes: s.notes })),
    Catalogue: data.materials.flatMap((m) =>
      (m.offers.length ? m.offers : [undefined]).map((o) => ({
        'Part number': m.partNumber,
        Description: m.description,
        Unit: m.unit,
        'SAP plants': (m.plants ?? []).join(', '),
        Supplier: o ? (sup.get(o.supplierId)?.name ?? '') : '',
        Quote: o ? label(`enums.supplierQuoteStatus.${o.quoteStatus}`) : '',
        'Quoted price': o?.quotedPrice,
        'Valid until': d(o?.validUntil),
        'Lead time (days)': o?.leadTimeDays,
      })),
    ),
    Leave_Absences: data.absences.map((a) => ({
      Employee: emp.get(a.employeeId)?.name ?? '',
      Type: label(`enums.absenceType.${a.type}`),
      Start: d(a.startDate),
      End: d(a.endDate),
      'Working days': businessDaysBetween(a.startDate, a.endDate),
      Note: a.note,
    })),
    // Sem relatório parcial: só serviços concluídos (todas as fases) e sem apontamento aberto.
    Workshop_Hours: [...data.timeEntries]
      .filter((e) => reportCheck(e.projectId, data).ok)
      .sort((a, b) => a.start.localeCompare(b.start))
      .map((e) => ({
        Employee: emp.get(e.employeeId)?.name ?? '',
        Project: prj.get(e.projectId)?.projectNumber ?? '',
        Customer: prj.get(e.projectId)?.customer ?? '',
        Phase: phases.get(e.phaseId)?.name ?? '',
        Date: d(localDay(e.start)),
        Start: hhmm(e.start),
        End: e.end ? (localDay(e.end) !== localDay(e.start) ? `${localDay(e.end).split('-').reverse().join('/')} ${hhmm(e.end)}` : hhmm(e.end)) : '',
        Hours: e.end ? Math.round(entryMinutes(e) / 6) / 10 : undefined,
        Source: e.source === 'qr' ? 'QR code' : 'Manual',
        Note: e.note,
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
  workPhases: [['name', 'string'], ['order', 'number'], ['active', 'boolean']],
  timeEntries: [['employeeId', 'string'], ['projectId', 'string'], ['phaseId', 'string'], ['start', 'string']],
};
/** Coleções criadas depois da v5: podem faltar em backups antigos (viram listas vazias). */
const OPTIONAL = new Set<CollectionName>(['workPhases', 'timeEntries']);

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
    if (list === undefined && OPTIONAL.has(name)) {
      data[name] = [];
      continue;
    }
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
    ref('timeEntries', db_.timeEntries, 'employeeId', 'employees');
    ref('timeEntries', db_.timeEntries, 'projectId', 'projects');
    ref('timeEntries', db_.timeEntries, 'phaseId', 'workPhases');
    // Na nuvem os usuários são as contas do Supabase (não vêm do backup).
    if (!EMAIL_AUTH && !db_.users.some((u) => u.role === 'master' && u.active)) issues.push({ key: 'dataio.errors.noMaster' });
  }

  const ok = issues.length === 0;
  const counts = Object.fromEntries((Object.keys(RULES) as CollectionName[]).map((n) => [n, Array.isArray(data[n]) ? (data[n] as unknown[]).length : 0])) as Record<CollectionName, number>;
  return { ok, issues, file: ok ? (f as BackupFile) : undefined, counts };
}

/** Substitui todos os dados pelos do backup (já validado). Sai da sessão se o usuário atual não existir mais. */
export function restoreBackup(file: BackupFile): void {
  const me = getCurrentUser();
  db.load(file.data, 'import');
  if (!EMAIL_AUTH && me && !file.data.users.some((u) => u.id === me.id && u.active)) logout();
}
