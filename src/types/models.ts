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

// ───────────────────────── Usuários & perfis ─────────────────────────

/** master = acesso total; logistics = compras/GR; office = orçamento, projetos e requisições. */
export type UserRole = 'master' | 'logistics' | 'office';

export interface User {
  id: ID;
  name: string;
  email: string;
  role: UserRole;
  /** SHA-256 de `spindleops:<id>:<pin>` (proteção de uso local — não substitui autenticação de servidor). */
  pinHash: string;
  active: boolean;
  /** Modo nuvem: conta criada e aguardando o Master definir o perfil. */
  pending?: boolean;
}

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
 * - `to_buy`   → precisa ser comprado (sem requisição nem PO)
 * - `requested`→ requisição de compra enviada à logística (sem PO ainda)
 * - `ordered`  → comprado, aguardando chegada
 * - `received` → material disponível
 * Quando vinculado a uma linha de PO (`poId` + `poLineId`) o status é DERIVADO da linha
 * (`domain/schedule.ts → materialStatus`); o campo `status` vale apenas para itens sem PO.
 */
export type MaterialStatus = 'to_buy' | 'requested' | 'ordered' | 'received';

export interface ProjectMaterial {
  id: ID;
  partNumber: string;
  description: string;
  quantity: number;
  status: MaterialStatus;
  /** Data em que o material é necessário (padrão: início do projeto). */
  neededBy?: ISODate;
  /** Requisição de compra que pediu este material. */
  requisitionId?: ID;
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

/** Recebimento (GR) registrado após o goods receipt no SAP. Permite recebimentos parciais. */
export interface GoodsReceipt {
  id: ID;
  /** Nº do documento de material do GR no SAP. */
  grNumber: string;
  date: ISODate;
  quantity: number;
  receivedBy: ID;
  notes: string;
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
  /** GRs desta linha (POs de compra). Quando há GRs, o status da linha é derivado das quantidades. */
  receipts?: GoodsReceipt[];
}

/** `sales` = PO recebida de um CLIENTE; `purchase` = PO de COMPRA emitida para um fornecedor. */
export type POKind = 'sales' | 'purchase';

export interface PurchaseOrder {
  id: ID;
  poNumber: string;
  kind: POKind;
  customerOrVendor: string;
  /** Fornecedor cadastrado (POs de compra). `customerOrVendor` guarda o nome exibido. */
  supplierId?: ID;
  /** Requisição de compra de origem (POs de compra). */
  requisitionId?: ID;
  orderDate: ISODate;
  requester: string;
  paymentTerms: string;
  status: POStatus;
  notes: string;
  attachments: Attachment[];
  lines: POLineItem[];
}

// ───────────────────────── Compras: fornecedores & catálogo ─────────────────────────

export interface Supplier {
  id: ID;
  name: string;
  contactName: string;
  email: string;
  phone: string;
  notes: string;
}

/** Situação da cotação de um material com um fornecedor. */
export type SupplierQuoteStatus = 'not_requested' | 'requested' | 'received';

/** Oferta de um fornecedor para um material do catálogo (um material pode ter vários). */
export interface SupplierOffer {
  supplierId: ID;
  quoteStatus: SupplierQuoteStatus;
  quotedPrice?: number;
  quoteDate?: ISODate;
  validUntil?: ISODate;
  /** Prazo de entrega em dias corridos após o pedido. */
  leadTimeDays: number;
  supplierPartNumber?: string;
}

/**
 * Material do catálogo. A chave de ligação com os materiais dos projetos e
 * com as linhas de PO é o `partNumber` (comparado sem diferenciar maiúsculas/espaços).
 * O "último valor pago" NÃO é guardado: é derivado do histórico de POs de compra.
 */
export interface CatalogMaterial {
  id: ID;
  partNumber: string;
  description: string;
  unit: string;
  offers: SupplierOffer[];
  /** Plantas/centros do SAP em que o material já está estendido (ex.: ['DE01', 'UK01']). */
  plants?: string[];
}

// ───────────────────────── Extensão de material (SAP) ─────────────────────────

/** Pedido para estender um material já existente em uma planta (ex.: DE01) para outra (ex.: UK01). */
export type ExtensionStatus = 'requested' | 'in_progress' | 'extended' | 'rejected';

export interface ExtensionEvent {
  at: string;
  userId: ID;
  action: 'requested' | 'started' | 'extended' | 'rejected' | 'comment';
  note: string;
}

export interface MaterialExtensionRequest {
  id: ID;
  number: string;
  partNumber: string;
  description: string;
  /** Fornecedor que vende o material (ex.: fornecedor alemão). */
  supplierId?: ID;
  fromPlant: string;
  toPlant: string;
  projectId?: ID;
  requestedBy: ID;
  requestedAt: ISODate;
  neededBy?: ISODate;
  status: ExtensionStatus;
  notes: string;
  /** Referência no SAP ao concluir (ex.: nº do material/solicitação MDG). */
  sapReference?: string;
  history: ExtensionEvent[];
}

// ───────────────────────── Requisição de compra ─────────────────────────

/**
 * submitted → quoting → (partially_)ordered → (partially_)received.
 * Os estados de pedido/recebimento são DERIVADOS dos materiais; rejected/canceled são manuais.
 */
export type RequisitionStatus =
  | 'submitted'
  | 'quoting'
  | 'partially_ordered'
  | 'ordered'
  | 'partially_received'
  | 'received'
  | 'rejected'
  | 'canceled';

export interface RequisitionItem {
  id: ID;
  /** Material do projeto (ProjectMaterial.id). */
  materialId: ID;
  partNumber: string;
  description: string;
  quantity: number;
}

export interface RequisitionEvent {
  at: string;
  userId: ID;
  action: 'submitted' | 'quoting' | 'po_registered' | 'gr_registered' | 'rejected' | 'canceled' | 'comment';
  note: string;
}

export interface PurchaseRequisition {
  id: ID;
  number: string;
  projectId: ID;
  requestedBy: ID;
  requestedAt: ISODate;
  neededBy?: ISODate;
  /** Estado manual (submitted/quoting/rejected/canceled); o efetivo é derivado em `domain/requisitions.ts`. */
  status: RequisitionStatus;
  notes: string;
  items: RequisitionItem[];
  history: RequisitionEvent[];
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
  users: User[];
  requisitions: PurchaseRequisition[];
  extensions: MaterialExtensionRequest[];
  employees: Employee[];
  projects: Project[];
  assignments: ProjectAssignment[];
  absences: Absence[];
  purchaseOrders: PurchaseOrder[];
  suppliers: Supplier[];
  materials: CatalogMaterial[];
  spindles: SpindleUnit[];
  forecast: ForecastItem[];
}

export type CollectionName = keyof AppDatabase;

/** Entidade armazenada em uma coleção. */
export type EntityOf<K extends CollectionName> = AppDatabase[K][number];
