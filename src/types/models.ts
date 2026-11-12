/**
 * Modelos de domínio — SpindleOps.
 *
 * Convenções:
 * - Datas: string `YYYY-MM-DD` (ISODate). Horas: `HH:mm` (TimeHHmm).
 * - IDs: string (prefixo por entidade, ex.: `emp_…`, `prj_…`).
 * - Valores derivados (totais de PO, valor ponderado, etc.) NUNCA são persistidos;
 *   são calculados em `src/domain/*`.
 * - Relacionamentos são guardados como chaves estrangeiras; as relações
 *   inversas (ex.: projetos de uma PO, materiais de uma linha de PO) são resolvidas por selectors.
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

// ───────────────────────── Schedule (Projetos) ─────────────────────────

export type ServiceType = 'site_visit' | 'pickup' | 'delivery' | 'bench_repair' | 'installation';

export type ProjectStatus = 'planned' | 'in_progress' | 'completed' | 'canceled';

/**
 * Status de um material do projeto:
 * - `to_buy`   → precisa ser comprado (sem PO)
 * - `ordered`  → comprado, aguardando chegada
 * - `received` → material disponível
 * Quando vinculado a uma linha de PO (`poId` + `poLineId`) o status é DERIVADO da linha
 * (`domain/schedule.ts → materialStatus`); o campo `status` vale apenas para itens sem PO.
 */
export type MaterialStatus = 'to_buy' | 'ordered' | 'received';

export interface ProjectMaterial {
  id: ID;
  partNumber: string;
  description: string;
  quantity: number;
  status: MaterialStatus;
  /** Data em que o material é necessário (padrão: início do projeto). */
  neededBy?: ISODate;
  poId?: ID;
  poLineId?: ID;
}

/** Projeto/serviço (ex.: reparo + instalação de um spindle num cliente). */
export interface Project {
  id: ID;
  projectNumber: string;
  customer: string;
  address: string;
  serviceType: ServiceType;
  description: string;
  status: ProjectStatus;
  /** Cor do retângulo no cronograma (identifica o projeto em várias linhas). */
  color: string;
  /** PO do cliente que originou o projeto. */
  poId?: ID;
  spindleId?: ID;
  materials: ProjectMaterial[];
}

/**
 * Alocação de um colaborador em um projeto por um período (a "barra" do cronograma).
 * Fins de semana não são dias de trabalho: `startDate`/`endDate` são sempre dias úteis.
 */
export interface ProjectAssignment {
  id: ID;
  projectId: ID;
  employeeId: ID;
  startDate: ISODate;
  endDate: ISODate;
}

export type AbsenceType = 'vacation' | 'leave' | 'training';

/** Férias/afastamentos — bloqueiam a linha do colaborador no período. */
export interface Absence {
  id: ID;
  employeeId: ID;
  type: AbsenceType;
  startDate: ISODate;
  endDate: ISODate;
  note: string;
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
  projects: Project[];
  assignments: ProjectAssignment[];
  absences: Absence[];
  purchaseOrders: PurchaseOrder[];
  spindles: SpindleUnit[];
  forecast: ForecastItem[];
}

export type CollectionName = keyof AppDatabase;

/** Entidade armazenada em uma coleção. */
export type EntityOf<K extends CollectionName> = AppDatabase[K][number];
