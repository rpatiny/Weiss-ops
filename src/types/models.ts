/**
 * Modelos de domínio — SpindleOps.
 *
 * Convenções:
 * - Datas: string `YYYY-MM-DD` (ISODate). Horas: `HH:mm` (TimeHHmm).
 * - IDs: string (prefixo por entidade, ex.: `emp_…`, `act_…`).
 * - Valores derivados (totais de PO, valor ponderado, etc.) NUNCA são persistidos;
 *   são calculados em `src/domain/*`.
 * - Relacionamentos são guardados como chaves estrangeiras opcionais; as relações
 *   inversas (ex.: atividades de uma PO) são resolvidas por selectors.
 */

export type ID = string;
/** Data no formato `YYYY-MM-DD`. */
export type ISODate = string;
/** Hora no formato `HH:mm`. */
export type TimeHHmm = string;

// ───────────────────────── Employees ─────────────────────────

export type EmployeeStatus = 'active' | 'inactive';

export interface Employee {
  id: ID;
  name: string;
  role: string;
  phone: string;
  email: string;
  /** Cor hex (`#RRGGBB`) para identificação no calendário. */
  color: string;
  status: EmployeeStatus;
}

// ───────────────────────── Calendar ─────────────────────────

export type ServiceType = 'site_visit' | 'pickup' | 'delivery' | 'bench_repair' | 'installation';

export type ActivityStatus = 'planned' | 'in_progress' | 'completed' | 'canceled';

export interface CalendarActivity {
  id: ID;
  employeeId: ID;
  customer: string;
  address: string;
  serviceType: ServiceType;
  description: string;
  date: ISODate;
  startTime: TimeHHmm;
  endTime: TimeHHmm;
  /** Ordem da parada na rota diária do colaborador (1, 2, 3…). */
  routeOrder: number;
  status: ActivityStatus;
  poId?: ID;
  spindleId?: ID;
}

// ───────────────────────── Purchase Orders ─────────────────────────

export type POStatus = 'open' | 'partial' | 'delivered' | 'invoiced' | 'canceled';
export type POLineStatus = 'open' | 'partial' | 'delivered' | 'canceled';
export type AttachmentType = 'po_pdf' | 'invoice' | 'other';

export interface Attachment {
  id: ID;
  name: string;
  url: string;
  type: AttachmentType;
}

export interface POLineItem {
  id: ID;
  lineNumber: number;
  partNumber: string;
  description: string;
  quantity: number;
  unitPrice: number;
  expectedDeliveryDate: ISODate;
  actualDeliveryDate?: ISODate;
  status: POLineStatus;
}

export interface PurchaseOrder {
  id: ID;
  poNumber: string;
  customerOrVendor: string;
  orderDate: ISODate;
  requester: string;
  paymentTerms: string;
  status: POStatus;
  notes: string;
  attachments: Attachment[];
  lines: POLineItem[];
}

// ───────────────────────── Financial ─────────────────────────

export type QuoteStatus = 'pending' | 'sent' | 'approved' | 'declined';

export type SpindleStatus =
  | 'received'
  | 'under_evaluation'
  | 'quoted'
  | 'approved'
  | 'in_repair'
  | 'testing'
  | 'delivered'
  | 'declined';

export interface SpindleUnit {
  id: ID;
  serialNumber: string;
  model: string;
  manufacturer: string;
  customer: string;
  receivedDate: ISODate;
  quoteNumber: string;
  quotedValue: number;
  quoteStatus: QuoteStatus;
  status: SpindleStatus;
  deliveryDate?: ISODate;
  poId?: ID;
  invoicedValue?: number;
}

export interface ForecastItem {
  id: ID;
  customer: string;
  spindleModel: string;
  description: string;
  estimatedValue: number;
  expectedDate: ISODate;
  /** 0–100 */
  probability: number;
}

// ───────────────────────── Database ─────────────────────────

/** Estado completo persistido da aplicação (também é o formato do backup JSON). */
export interface AppDatabase {
  employees: Employee[];
  activities: CalendarActivity[];
  purchaseOrders: PurchaseOrder[];
  spindles: SpindleUnit[];
  forecast: ForecastItem[];
}

export type CollectionName = keyof AppDatabase;

/** Entidade armazenada em uma coleção. */
export type EntityOf<K extends CollectionName> = AppDatabase[K][number];
