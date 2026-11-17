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
  /** Hash do PIN do ponto da oficina (QR code). Sem PIN o colaborador não marca horas. */
  clockPinHash?: string;
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
  /** Nº da PO do cliente — texto livre (fonte da verdade). */
  customerPoRef?: string;
  /** Spindle / motor — texto livre (fonte da verdade). */
  spindleRef?: string;
  /** Vínculo DERIVADO do texto: PO cadastrada com o mesmo número (se houver). */
  poId?: ID;
  /** Vínculo DERIVADO do texto: spindle cadastrado com o mesmo nº de série (se houver). */
  spindleId?: ID;
  materials: ProjectMaterial[];
  /** Link do portal do cliente (token aleatório). Sem token = portal desligado para o projeto. */
  portalToken?: string;
  /** Cliente do cadastro (o nome fica em `customer`). */
  clientId?: ID;
  /**
   * Arquivado: projeto concluído sai de todas as telas (Agenda, TV, horas…) e fica no Arquivo no fim de Projects.
   * `false` explícito = recuperado (não volta a arquivar sozinho). Recuperar exige confirmação digitada.
   */
  archived?: boolean;
  archivedAt?: string;
  /** PO do cliente — UMA por projeto (número em `customerPoRef`): data e valor. Editar exige confirmação. */
  customerPoDate?: ISODate;
  customerPoValue?: number;
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
  /** Quando quem pediu viu a conclusão pela última vez — apaga o número verde. */
  requesterSeenAt?: string;
}

// ───────────────────────── Requisição de compra ─────────────────────────

/**
 * submitted → quoting → (partially_)ordered → (partially_)received.
 * Os estados de pedido/recebimento são DERIVADOS dos materiais; rejected/canceled são manuais.
 */
export type RequisitionStatus =
  | 'submitted'
  | 'quoting'
  /** Todos os itens com fornecedor escolhido e preço — pronto para a Logística registrar a PO. */
  | 'quoted'
  | 'partially_ordered'
  | 'ordered'
  | 'partially_received'
  | 'received'
  | 'rejected'
  | 'canceled';

/** Fornecedor de um item do pedido: RFQ enviado e cotação recebida (a cotação também vai para o catálogo). */
export interface RequisitionSupplier {
  supplierId: ID;
  rfqSentAt?: string;
  price?: number;
  leadTimeDays?: number;
  validUntil?: ISODate;
  quoteRef?: string;
  quotedAt?: string;
  quotedBy?: ID;
}

export interface RequisitionItem {
  id: ID;
  /** Material do projeto (ProjectMaterial.id). */
  materialId: ID;
  partNumber: string;
  description: string;
  quantity: number;
  /** Fornecedores do item (o Office informa pelo menos um). Pedidos antigos podem não ter. */
  suppliers?: RequisitionSupplier[];
  /** Fornecedor escolhido (cotação vencedora) — vai para a PO. */
  chosenSupplierId?: ID;
}

export interface RequisitionEvent {
  at: string;
  userId: ID;
  action: 'submitted' | 'quoting' | 'rfq_sent' | 'quote_received' | 'supplier_chosen' | 'po_registered' | 'gr_registered' | 'rejected' | 'canceled' | 'comment';
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
  /** Quando quem pediu viu as novidades (PO registrada) pela última vez — apaga o número verde. */
  requesterSeenAt?: string;
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
  clientId?: ID;
  serialNumber: string;
  model: string;
  manufacturer: string;
  customer: string;
  receivedDate: ISODate;
  quoteNumber: string;
  /** Data em que a cotação foi enviada ao cliente. */
  quoteDate?: ISODate;
  quotedValue: number;
  quoteStatus: QuoteStatus;
  status: SpindleStatus;
  deliveryDate?: ISODate;
  /** Nº da PO do cliente — texto livre (fonte da verdade). */
  poRef?: string;
  /** Vínculo DERIVADO do texto: PO cadastrada com o mesmo número (se houver). */
  poId?: ID;
  invoicedValue?: number;
}

export interface ForecastItem {
  id: ID;
  clientId?: ID;
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
/** Fase do trabalho na oficina (desmontagem, remontagem, teste…). Lista editável. */
export interface WorkPhase {
  id: ID;
  name: string;
  /** Ordem de exibição. */
  order: number;
  active: boolean;
}

/** Apontamento de horas: check-in/check-out de um colaborador numa fase de um projeto. */
export interface TimeEntry {
  id: ID;
  employeeId: ID;
  projectId: ID;
  phaseId: ID;
  /** Data/hora ISO completa (com fuso), ex.: 2026-11-13T08:12:00.000Z. */
  start: string;
  /** Ausente = em andamento. */
  end?: string;
  /** `qr` = marcado pelo técnico no ponto; `manual` = lançado/corrigido pela supervisão. */
  source: 'qr' | 'manual';
  /** Fechado automaticamente ao iniciar outra fase. */
  autoClosed?: boolean;
  /** Encerrado com "Concluir fase": a fase deste projeto está pronta (libera a próxima). */
  completesPhase?: boolean;
  /** Supervisão liberou o colaborador do serviço sem concluir todas as fases (ex.: aguardando material). */
  released?: { by: ID; at: string; note: string };
  note: string;
  /** Usuário que corrigiu/lançou (supervisão). */
  editedBy?: ID;
}

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
  workPhases: WorkPhase[];
  timeEntries: TimeEntry[];
  shopfloorRequests: ShopfloorRequest[];
  customers: CustomerAccount[];
  projectUpdates: ProjectUpdate[];
  auditLog: AuditEntry[];
  clients: Client[];
}

export type ShopfloorRequestStatus = 'new' | 'ordered' | 'rejected';

/**
 * Pedido de compra feito no chão de fábrica (QR code → celular, sem login no app; o técnico se identifica com o PIN do ponto).
 * Todos os campos são obrigatórios. A Logística marca como pedido (nº da PO) ou recusa (motivo).
 */
export interface ShopfloorRequest {
  id: ID;
  /** SF-00001… */
  number: string;
  employeeId: ID;
  createdAt: string;
  /** Foto do item (JPEG reduzido, data URL). */
  photo: string;
  description: string;
  quantity: number;
  supplier: string;
  supplierCode: string;
  /** Projeto (serviço) a que o material se destina; vazio/'general' = uso geral / estoque da oficina. */
  projectId?: ID;
  /** PO de compra real criada/completada ao "marcar como pedido" (entra em GR, catálogo, último valor pago). */
  poId?: ID;
  poLineId?: ID;
  status: ShopfloorRequestStatus;
  handledBy?: ID;
  handledAt?: string;
  /** Nº da PO (pedido) ou motivo (recusa). */
  note?: string;
}

/**
 * Conta de acesso do CLIENTE ao portal (não é usuário interno). Vale para os projetos cujo `customer` tem o mesmo nome
 * (sem diferenciar maiúsculas/espaços). Senha = 6 dígitos (hash com sal = id).
 */
export interface CustomerAccount {
  id: ID;
  /** Cliente do cadastro. */
  clientId?: ID;
  /** Nome do cliente, igual ao usado nos projetos (ex.: "Rolls-Royce"). */
  name: string;
  /** Usuário de login (minúsculas). */
  username: string;
  pinHash: string;
  active: boolean;
  email?: string;
  createdAt: string;
}

export type ProjectUpdateKind = 'assessment' | 'phase' | 'note';
export type ProjectUpdateStatus = 'pending' | 'approved' | 'rejected';

/**
 * Atualização do relatório do cliente. Nasce SEMPRE como `pending`; só aparece no portal depois que o Office aprova
 * (pode editar título/texto, tirar fotos e esconder as horas antes de aprovar).
 */
export interface ProjectUpdate {
  id: ID;
  projectId: ID;
  kind: ProjectUpdateKind;
  title: string;
  text: string;
  /** Fotos reduzidas (data URL JPEG). */
  photos: string[];
  /** Fase concluída (kind = 'phase'). */
  phaseId?: ID;
  /** Horas trabalhadas na fase (minutos, foto do momento da conclusão). */
  minutes?: number;
  /** Mostrar as horas ao cliente (decisão do Office na revisão). */
  showHours: boolean;
  createdAt: string;
  author: { kind: 'employee' | 'user'; id: ID };
  status: ProjectUpdateStatus;
  reviewedBy?: ID;
  reviewedAt?: string;
  /** Motivo da recusa (interno). */
  reviewNote?: string;
}

export interface Address {
  line1: string;
  line2?: string;
  city: string;
  postcode: string;
  country: string;
}

/**
 * Cadastro único de CLIENTES. Projetos, spindles, forecast e contas do portal apontam para cá (`clientId`); o nome
 * continua copiado nos registros (exibição) e é atualizado quando o cliente é renomeado.
 * O ENDEREÇO DE ENTREGA pode ser diferente do de cobrança — é o que a Logística usa para enviar.
 */
export interface Client {
  id: ID;
  /** Nome usado no app (ex.: "Rolls-Royce"). Único. */
  name: string;
  /** Nº da conta do cliente (SAP / ERP). */
  accountNumber: string;
  legalName?: string;
  vatNumber?: string;
  billingAddress: Address;
  /** Entrega no mesmo endereço da cobrança? */
  deliverySameAsBilling: boolean;
  deliveryAddress?: Address;
  deliveryContact?: string;
  deliveryPhone?: string;
  /** Instruções de entrega (horário de recebimento, doca, portaria…). */
  deliveryNotes?: string;
  contactName: string;
  email: string;
  phone: string;
  notes?: string;
  createdAt: string;
  /** Criado automaticamente a partir de um nome antigo — faltam dados (completar). */
  incomplete?: boolean;
}

/** Histórico de mudanças (gerado automaticamente em `data/audit.ts`; só o Master vê). */
export interface AuditEntry {
  id: ID;
  at: string;
  /** Projetos afetados pela mudança. */
  projectIds: ID[];
  collection: string;
  recordId: ID;
  /** Nome curto do registro (nº do projeto, RC, PO, nº de série…). */
  label: string;
  action: 'create' | 'update' | 'delete';
  actor: string;
  actorKind: 'user' | 'employee' | 'system';
  /** "campo: antes → depois" */
  changes: string[];
}

export type CollectionName = keyof AppDatabase;

/** Entidade armazenada em uma coleção. */
export type EntityOf<K extends CollectionName> = AppDatabase[K][number];
