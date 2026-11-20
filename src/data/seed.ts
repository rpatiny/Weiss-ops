/**
 * Dados de demonstração realistas (reparo de spindles e motores industriais).
 * Todas as datas são RELATIVAS ao dia em que o seed é gerado, para que a demo
 * sempre mostre atividades da semana, POs atrasadas, entregas do mês etc.
 */
import { addBusinessDays, addDays, addMonths, parseISODate, startOfWeek, toISODate, todayISO } from '@/lib/dates';
import { clockPinHash } from '@/lib/sha256';
import { DEFAULT_EMPLOYEE_ROLE } from '@/lib/config';
import type {
  TimeEntry,
  WorkPhase,
  Absence,
  AppDatabase,
  CatalogMaterial,
  Employee,
  ExtensionEvent,
  MaterialExtensionRequest,
  ForecastItem,
  POLineItem,
  Project,
  ProjectAssignment,
  PurchaseOrder,
  PurchaseRequisition,
  RequisitionEvent,
  RequisitionItem,
  User,
  SpindleUnit,
  Supplier,
  SupplierOffer,
  Client,
} from '@/types/models';

const CUSTOMERS = {
  // Clientes reais da Weiss UK (endereços genéricos: preencher os reais no app).
  usinagem: { name: 'PCS', address: 'United Kingdom' },
  metalforte: { name: 'Gestamp', address: 'United Kingdom' },
  aeromec: { name: 'BAE Systems', address: 'United Kingdom' },
  moldes: { name: 'CNC Speedwell', address: 'United Kingdom' },
  alfa: { name: 'GKN Aerospace', address: 'United Kingdom' },
  autopecas: { name: 'JCB', address: 'United Kingdom' },
  hidrotec: { name: 'Rolls-Royce', address: 'United Kingdom' },
  textil: { name: 'Renishaw', address: 'United Kingdom' },
} as const;

/**
 * Cadastro de clientes da demonstração. São clientes reais da Weiss UK: os endereços NÃO são inventados —
 * ficam "TBC" (a confirmar) e o cadastro sai marcado como incompleto para a equipe preencher os dados reais.
 */
const tbc = (label: string) => ({ line1: `${label} — address to be confirmed`, city: 'TBC', postcode: 'TBC', country: 'United Kingdom' });
export function demoClients(now: string): Client[] {
  const mk = (id: string, name: string, n: number, separateDelivery = false): Client => ({
    id,
    name,
    accountNumber: `C-${1000 + n}`,
    billingAddress: tbc('Accounts payable'),
    deliverySameAsBilling: !separateDelivery,
    deliveryAddress: separateDelivery ? tbc('Goods-in / site') : undefined,
    deliveryContact: separateDelivery ? 'Goods-in team' : undefined,
    deliveryPhone: separateDelivery ? `01632 9601${10 + n}` : undefined,
    deliveryNotes: separateDelivery ? 'Deliveries Mon–Fri 08:00–15:30. Book a slot 24 h ahead.' : undefined,
    contactName: 'Purchasing contact (TBC)',
    email: `purchasing.${id.replace('cl_', '')}@example.com`,
    phone: `01632 9600${10 + n}`,
    createdAt: now,
    incomplete: true,
  });
  return [
    mk('cl_pcs', CUSTOMERS.usinagem.name, 1, true),
    mk('cl_gestamp', CUSTOMERS.metalforte.name, 2),
    mk('cl_bae', CUSTOMERS.aeromec.name, 3, true),
    mk('cl_cnc', CUSTOMERS.moldes.name, 4),
    mk('cl_gkn', CUSTOMERS.alfa.name, 5),
    mk('cl_jcb', CUSTOMERS.autopecas.name, 6),
    mk('cl_rr', CUSTOMERS.hidrotec.name, 7),
    mk('cl_ren', CUSTOMERS.textil.name, 8),
    { ...mk('cl_weiss', 'Weiss workshop (bench)', 9), contactName: 'Workshop', incomplete: true },
  ];
}

/** Projetos: 1000 + 4 caracteres; em teste os 4 dígitos são letras (ver `nextProjectNumber`). */
export const DEMO_PROJECT_NUMBERS = ['1000BKXA', '1000CMRT', '1000DHWL', '1000FJQE', '1000GNPS', '1000HTVB', '1000KRZD', '1000LWCF', '1000MPXG', '1000NQAH'];

const SHOP_ADDRESS = 'Weiss UK workshop';
/** Tipo de serviço é texto livre; a demo usa os nomes em inglês (bases antigas tinham códigos). */
export const SERVICE_TYPE_TEXT: Record<string, string> = {
  site_visit: 'Site visit',
  pickup: 'Pickup',
  delivery: 'Delivery',
  bench_repair: 'Bench repair',
  installation: 'Installation',
};

const employees: Employee[] = [
  { id: 'emp_carlos', name: 'Emma', role: DEFAULT_EMPLOYEE_ROLE, phone: '07700 900101', email: 'emma@example.com', color: '#2563eb', status: 'active' },
  { id: 'emp_juliana', name: 'Dave', role: DEFAULT_EMPLOYEE_ROLE, phone: '07700 900102', email: 'dave@example.com', color: '#7c3aed', status: 'active' },
  { id: 'emp_rafael', name: 'Nigel', role: DEFAULT_EMPLOYEE_ROLE, phone: '07700 900103', email: 'nigel@example.com', color: '#d97706', status: 'active' },
  { id: 'emp_marcos', name: 'Rupert', role: DEFAULT_EMPLOYEE_ROLE, phone: '07700 900104', email: 'rupert@example.com', color: '#16a34a', status: 'active' },
  { id: 'emp_patricia', name: 'Owen', role: DEFAULT_EMPLOYEE_ROLE, phone: '07700 900105', email: 'owen@example.com', color: '#db2777', status: 'active' },
  { id: 'emp_eduardo', name: 'Jaimie', role: DEFAULT_EMPLOYEE_ROLE, phone: '07700 900106', email: 'jaimie@example.com', color: '#0891b2', status: 'inactive' },
];

function line(
  id: string,
  lineNumber: number,
  partNumber: string,
  description: string,
  quantity: number,
  unitPrice: number,
  expectedDeliveryDate: string,
  status: POLineItem['status'],
  actualDeliveryDate?: string,
): POLineItem {
  return { id, lineNumber, partNumber, description, quantity, unitPrice, expectedDeliveryDate, status, actualDeliveryDate };
}

export function buildSeed(today: string = todayISO()): AppDatabase {
  const d = (n: number) => addDays(today, n);
  const m = (n: number, day = 0) => addDays(addMonths(today, n), day);
  const week = startOfWeek(today);

  // ───────────── Purchase Orders ─────────────
  const purchaseOrders: PurchaseOrder[] = [
    {
      id: 'po_4500918', poNumber: '4500918', kind: 'sales', customerOrVendor: CUSTOMERS.usinagem.name, orderDate: d(-24),
      requester: 'Mark Ellis', paymentTerms: '30 days net', status: 'partial',
      notes: 'Repair of 2 spindles from the 5-axis machining centre line. High priority.',
      attachments: [{ id: 'att_1', name: 'PO 4500918.pdf', url: 'https://example.com/po/4500918.pdf', type: 'po_pdf' }],
      lines: [
        line('pol_1', 10, 'SRV-FIS-MFW2310', 'Full repair Fischer spindle MFW-2310 (S/N FS-22871)', 1, 48500, d(-3), 'open'),
        line('pol_2', 20, 'SRV-FIS-MFW2310', 'Full repair Fischer spindle MFW-2310 (S/N FS-22904)', 1, 48500, d(-10), 'delivered', d(-11)),
        line('pol_3', 30, 'SRV-BAL-G1', 'Additional G1.0 dynamic balancing', 2, 1850, d(4), 'open'),
      ],
    },
    {
      id: 'po_mf2291', poNumber: 'GST-2291', kind: 'sales', customerOrVendor: CUSTOMERS.metalforte.name, orderDate: d(-12),
      requester: 'Sarah Price (Purchasing)', paymentTerms: '30/60 days', status: 'open',
      notes: 'Burnt-out WEG W22 motor — rewind + bearing replacement.',
      attachments: [{ id: 'att_2', name: 'PO GST-2291.pdf', url: 'https://example.com/po/GST-2291.pdf', type: 'po_pdf' }],
      lines: [
        line('pol_4', 1, 'SRV-WEG-W22-RB', 'Rewind WEG W22 30 hp 4-pole motor', 1, 9800, d(5), 'open'),
        line('pol_5', 2, 'ROL-6312-2Z', 'SKF 6312-2Z/C3 bearing', 2, 640, d(5), 'open'),
      ],
    },
    {
      id: 'po_aer7731', poNumber: 'BAE-7731', kind: 'sales', customerOrVendor: CUSTOMERS.aeromec.name, orderDate: d(-40),
      requester: 'Richard Allen', paymentTerms: '45 days net', status: 'invoiced',
      notes: 'Step-Tec HVC 140 spindle — test certificate attached to the invoice.',
      attachments: [
        { id: 'att_3', name: 'PO BAE-7731.pdf', url: 'https://example.com/po/BAE-7731.pdf', type: 'po_pdf' },
        { id: 'att_4', name: 'Invoice 18842.pdf', url: 'https://example.com/invoice/18842.pdf', type: 'invoice' },
      ],
      lines: [line('pol_6', 1, 'SRV-STT-HVC140', 'Step-Tec HVC 140 spindle repair (S/N ST-51022)', 1, 62300, d(-15), 'delivered', d(-14))],
    },
    {
      id: 'po_mmj0457', poNumber: 'CNC-0457', kind: 'sales', customerOrVendor: CUSTOMERS.moldes.name, orderDate: d(-18),
      requester: 'Luke Fenton', paymentTerms: '30 days net', status: 'open',
      notes: 'High-speed spindle for mould milling. Customer requested a vibration test.',
      attachments: [],
      lines: [
        line('pol_7', 1, 'SRV-IBG-HF120', 'IBAG HF 120 spindle repair (S/N IB-8812)', 1, 27400, d(-2), 'open'),
        line('pol_8', 2, 'SRV-VIB-RPT', 'Vibration analysis report', 1, 1200, d(-2), 'open'),
      ],
    },
    {
      id: 'po_skf33012', poNumber: '4500391122', kind: 'purchase', requisitionId: 'rc_1', supplierId: 'sup_rp', customerOrVendor: 'Precision Bearings UK', orderDate: d(-9),
      requester: 'Dave', paymentTerms: '30 days net', status: 'partial',
      notes: 'Precision bearings for bench stock.',
      attachments: [{ id: 'att_5', name: 'Quote PB-1188.pdf', url: 'https://example.com/supplier/PB-1188.pdf', type: 'other' }],
      lines: [
        line('pol_9', 1, 'SKF-7014CD/P4A', 'SKF 7014 CD/P4A angular contact bearing (pair)', 4, 2950, d(-4), 'delivered', d(-5)),
        line('pol_10', 2, 'SKF-7012ACD/HCP4A', 'SKF 7012 ACD/HCP4A hybrid bearing (pair)', 2, 4380, d(-1), 'open'),
        line('pol_11', 3, 'KLU-ISOFLEX-NBU15', 'Klüber Isoflex NBU 15 grease (50 g)', 10, 189, d(3), 'open'),
      ],
    },
    {
      id: 'po_cmp4471', poNumber: '4500391187', kind: 'purchase', requisitionId: 'rc_2', supplierId: 'sup_cip', customerOrVendor: 'Midlands Industrial Components', orderDate: d(-7),
      requester: 'Dave', paymentTerms: '30 days net', status: 'partial',
      notes: 'Materials for the IBAG HF 120 and Kessler DMS 120 jobs.',
      attachments: [],
      lines: [
        line('cmp_1', 1, 'IBG-SEAL-KIT-HF120', 'IBAG HF 120 seal kit', 1, 1450, d(2), 'open'),
        line('cmp_2', 2, 'HEID-ERN1387', 'Encoder Heidenhain ERN 1387 2048 ppr', 1, 6890, d(-3), 'delivered', d(-3)),
      ],
    },
    {
      id: 'po_rp0981', poNumber: '4500388410', kind: 'purchase', supplierId: 'sup_rp', customerOrVendor: 'Precision Bearings UK', orderDate: m(-2, -10),
      requester: 'Dave', paymentTerms: '30 days net', status: 'invoiced',
      notes: 'Bench stock replenishment.',
      attachments: [{ id: 'att_8', name: 'Invoice 55120.pdf', url: 'https://example.com/invoice/55120.pdf', type: 'invoice' }],
      lines: [
        line('rp_1', 1, 'SKF-7014CD/P4A', 'SKF 7014 CD/P4A angular contact bearing (pair)', 2, 2890, m(-2, -5), 'delivered', m(-2, -6)),
        line('rp_2', 2, 'KLU-ISOFLEX-NBU15', 'Klüber Isoflex NBU 15 grease (50 g)', 6, 175, m(-2, -5), 'delivered', m(-2, -5)),
      ],
    },
    {
      id: 'po_skf2210', poNumber: '4500385067', kind: 'purchase', supplierId: 'sup_skf', customerOrVendor: 'SKF (UK)', orderDate: m(-4, -3),
      requester: 'Dave', paymentTerms: '45 days net', status: 'invoiced',
      notes: 'Direct purchase — long lead time.',
      attachments: [],
      lines: [
        line('skf_1', 1, 'SKF-7014CD/P4A', 'SKF 7014 CD/P4A angular contact bearing (pair)', 4, 2780, m(-4, 18), 'delivered', m(-4, 20)),
        line('skf_2', 2, 'SKF-7012ACD/HCP4A', 'SKF 7012 ACD/HCP4A hybrid bearing (pair)', 2, 4120, m(-4, 18), 'delivered', m(-4, 20)),
      ],
    },
    {
      id: 'po_alf1120', poNumber: 'GKN-1120', kind: 'sales', customerOrVendor: CUSTOMERS.alfa.name, orderDate: d(-6),
      requester: 'Martha Gill', paymentTerms: 'Payment on receipt', status: 'open',
      notes: 'Kessler motor spindle retrofit + on-site installation.',
      attachments: [{ id: 'att_6', name: 'PO GKN-1120.pdf', url: 'https://example.com/po/GKN-1120.pdf', type: 'po_pdf' }],
      lines: [
        line('pol_12', 1, 'SRV-KES-DMS120', 'Kessler DMS 120 motor spindle repair (S/N KS-30419)', 1, 39800, d(9), 'open'),
        line('pol_13', 2, 'SRV-INST-CAMPO', 'On-site installation and alignment (8 h)', 1, 3200, d(11), 'open'),
      ],
    },
    {
      id: 'po_hid5502', poNumber: 'RR-5502', kind: 'sales', customerOrVendor: CUSTOMERS.hidrotec.name, orderDate: d(-55),
      requester: 'Paul Carter', paymentTerms: '30 days net', status: 'delivered',
      notes: 'Siemens 1FT7 servo motor — encoder and bearing replacement.',
      attachments: [{ id: 'att_7', name: 'PO RR-5502.pdf', url: 'https://example.com/po/RR-5502.pdf', type: 'po_pdf' }],
      lines: [line('pol_14', 1, 'SRV-SIE-1FT7', 'Siemens 1FT7086 servo motor repair + encoder', 1, 14600, d(-30), 'delivered', d(-28))],
    },
    {
      id: 'po_avp8810', poNumber: 'JCB-8810', kind: 'sales', customerOrVendor: CUSTOMERS.autopecas.name, orderDate: d(-3),
      requester: 'Camilla Dean', paymentTerms: '60 days net', status: 'open',
      notes: '3 Mazak lathe spindles for preventive overhaul.',
      attachments: [],
      lines: [
        line('pol_15', 1, 'SRV-MAZ-PREV', 'Mazak QTN-250 spindle preventive overhaul', 3, 16900, d(20), 'open'),
        line('pol_16', 2, 'SRV-FRETE', 'Dedicated collection/delivery', 2, 850, d(6), 'open'),
      ],
    },
    {
      id: 'po_tex0091', poNumber: 'REN-0091', kind: 'sales', customerOrVendor: CUSTOMERS.textil.name, orderDate: d(-70),
      requester: 'Robert Nash', paymentTerms: '30 days net', status: 'canceled',
      notes: 'Cancelled by the customer — machine replaced.',
      attachments: [],
      lines: [line('pol_17', 1, 'SRV-WEG-W22-RB', 'Rewind WEG W22 50 hp motor', 1, 13200, d(-50), 'canceled')],
    },
  ];

  // ───────────── Spindles / Motores ─────────────
  const spindles: SpindleUnit[] = [
    { id: 'sp_fs22871', serialNumber: 'FS-22871', model: 'MFW-2310', manufacturer: 'Fischer', customer: CUSTOMERS.usinagem.name, receivedDate: d(-30), quoteNumber: 'QUO-2611-014', quotedValue: 48500, quoteStatus: 'approved', status: 'testing', poId: 'po_4500918' },
    { id: 'sp_fs22904', serialNumber: 'FS-22904', model: 'MFW-2310', manufacturer: 'Fischer', customer: CUSTOMERS.usinagem.name, receivedDate: d(-30), quoteNumber: 'QUO-2611-015', quotedValue: 48500, quoteStatus: 'approved', status: 'delivered', deliveryDate: d(-11), poId: 'po_4500918', invoicedValue: 48500 },
    { id: 'sp_weg30', serialNumber: 'WEG-1022871', model: 'W22 30hp 4P', manufacturer: 'WEG', customer: CUSTOMERS.metalforte.name, receivedDate: d(-14), quoteNumber: 'QUO-2611-021', quotedValue: 11080, quoteStatus: 'approved', status: 'in_repair', poId: 'po_mf2291' },
    { id: 'sp_st51022', serialNumber: 'ST-51022', model: 'HVC 140', manufacturer: 'Step-Tec', customer: CUSTOMERS.aeromec.name, receivedDate: d(-45), quoteNumber: 'QUO-2610-033', quotedValue: 62300, quoteStatus: 'approved', status: 'delivered', deliveryDate: d(-14), poId: 'po_aer7731', invoicedValue: 62300 },
    { id: 'sp_ib8812', serialNumber: 'IB-8812', model: 'HF 120', manufacturer: 'IBAG', customer: CUSTOMERS.moldes.name, receivedDate: d(-21), quoteNumber: 'QUO-2611-009', quotedValue: 28600, quoteStatus: 'approved', status: 'in_repair', poId: 'po_mmj0457' },
    { id: 'sp_ks30419', serialNumber: 'KS-30419', model: 'DMS 120', manufacturer: 'Kessler', customer: CUSTOMERS.alfa.name, receivedDate: d(-8), quoteNumber: 'QUO-2611-027', quotedValue: 39800, quoteStatus: 'approved', status: 'approved', poId: 'po_alf1120' },
    { id: 'sp_sie1ft7', serialNumber: 'SIE-1FT7086-88', model: '1FT7086 Servo', manufacturer: 'Siemens', customer: CUSTOMERS.hidrotec.name, receivedDate: d(-60), quoteNumber: 'QUO-2609-041', quotedValue: 14600, quoteStatus: 'approved', status: 'delivered', deliveryDate: d(-28), poId: 'po_hid5502', invoicedValue: 14600 },
    { id: 'sp_mz1', serialNumber: 'MZ-QTN-77120', model: 'QTN-250 Spindle', manufacturer: 'Mazak', customer: CUSTOMERS.autopecas.name, receivedDate: d(-2), quoteNumber: 'QUO-2611-031', quotedValue: 16900, quoteStatus: 'sent', status: 'quoted', poId: 'po_avp8810' },
    { id: 'sp_gmn', serialNumber: 'GMN-170-4471', model: 'HCS 170', manufacturer: 'GMN', customer: CUSTOMERS.aeromec.name, receivedDate: d(-6), quoteNumber: 'QUO-2611-029', quotedValue: 54200, quoteStatus: 'sent', status: 'quoted' },
    { id: 'sp_fanuc', serialNumber: 'FAN-A06B-0247', model: 'αiI 12/10000', manufacturer: 'Fanuc', customer: CUSTOMERS.moldes.name, receivedDate: d(-4), quoteNumber: 'QUO-2611-030', quotedValue: 0, quoteStatus: 'pending', status: 'under_evaluation' },
    { id: 'sp_haas', serialNumber: 'HAAS-40T-90233', model: 'Spindle 40-Taper 8100rpm', manufacturer: 'Haas', customer: CUSTOMERS.alfa.name, receivedDate: d(-1), quoteNumber: '', quotedValue: 0, quoteStatus: 'pending', status: 'received' },
    { id: 'sp_weiss', serialNumber: 'WS-170-11082', model: 'WS 170', manufacturer: 'Weiss', customer: CUSTOMERS.textil.name, receivedDate: d(-38), quoteNumber: 'QUO-2610-022', quotedValue: 33700, quoteStatus: 'declined', status: 'declined' },
    { id: 'sp_weg50', serialNumber: 'WEG-2290017', model: 'W22 50hp 2P', manufacturer: 'WEG', customer: CUSTOMERS.hidrotec.name, receivedDate: d(-25), quoteNumber: 'QUO-2611-004', quotedValue: 15800, quoteStatus: 'declined', status: 'declined' },
    // Histórico (meses anteriores) para gráfico Realizado vs. Forecast e ranking
    { id: 'sp_h1', serialNumber: 'FS-21533', model: 'MFW-1710', manufacturer: 'Fischer', customer: CUSTOMERS.usinagem.name, receivedDate: m(-5, -20), quoteNumber: 'QUO-2605-011', quotedValue: 41200, quoteStatus: 'approved', status: 'delivered', deliveryDate: m(-5), invoicedValue: 41200 },
    { id: 'sp_h2', serialNumber: 'ST-49877', model: 'HSK-A63 Motor Spindle', manufacturer: 'Step-Tec', customer: CUSTOMERS.aeromec.name, receivedDate: m(-4, -25), quoteNumber: 'QUO-2606-018', quotedValue: 58900, quoteStatus: 'approved', status: 'delivered', deliveryDate: m(-4), invoicedValue: 57500 },
    { id: 'sp_h3', serialNumber: 'WEG-1877412', model: 'W22 20hp 4P', manufacturer: 'WEG', customer: CUSTOMERS.metalforte.name, receivedDate: m(-4, -10), quoteNumber: 'QUO-2606-024', quotedValue: 8400, quoteStatus: 'approved', status: 'delivered', deliveryDate: m(-4, 3), invoicedValue: 8400 },
    { id: 'sp_h4', serialNumber: 'KS-28811', model: 'DMS 100', manufacturer: 'Kessler', customer: CUSTOMERS.moldes.name, receivedDate: m(-3, -18), quoteNumber: 'QUO-2607-007', quotedValue: 36400, quoteStatus: 'approved', status: 'delivered', deliveryDate: m(-3), invoicedValue: 36400 },
    { id: 'sp_h5', serialNumber: 'IB-8530', model: 'HF 80', manufacturer: 'IBAG', customer: CUSTOMERS.alfa.name, receivedDate: m(-2, -15), quoteNumber: 'QUO-2608-013', quotedValue: 22300, quoteStatus: 'approved', status: 'delivered', deliveryDate: m(-2), invoicedValue: 22300 },
    { id: 'sp_h6', serialNumber: 'FS-22011', model: 'MFW-2310', manufacturer: 'Fischer', customer: CUSTOMERS.usinagem.name, receivedDate: m(-2, -20), quoteNumber: 'QUO-2608-019', quotedValue: 47900, quoteStatus: 'approved', status: 'delivered', deliveryDate: m(-2, 5), invoicedValue: 47900 },
    { id: 'sp_h7', serialNumber: 'MZ-QTN-70011', model: 'QTN-200 Spindle', manufacturer: 'Mazak', customer: CUSTOMERS.autopecas.name, receivedDate: m(-1, -22), quoteNumber: 'QUO-2609-028', quotedValue: 15600, quoteStatus: 'approved', status: 'delivered', deliveryDate: m(-1), invoicedValue: 15600 },
    { id: 'sp_h8', serialNumber: 'GMN-120-3902', model: 'HC 120', manufacturer: 'GMN', customer: CUSTOMERS.aeromec.name, receivedDate: m(-1, -30), quoteNumber: 'QUO-2609-031', quotedValue: 44100, quoteStatus: 'approved', status: 'delivered', deliveryDate: m(-1, 4), invoicedValue: 44100 },
  ];
  // Cotação enviada 2 dias após o recebimento (exceto as ainda pendentes).
  for (const s of spindles) if (s.quoteStatus !== 'pending') s.quoteDate = addDays(s.receivedDate, 2);

  // ───────────── Forecast ─────────────
  const forecast: ForecastItem[] = [
    { id: 'fc_1', customer: CUSTOMERS.aeromec.name, spindleModel: 'GMN HCS 170', description: 'Quote QUO-2611-029 expected to be approved', estimatedValue: 54200, expectedDate: m(1, -5), probability: 80 },
    { id: 'fc_2', customer: CUSTOMERS.autopecas.name, spindleModel: 'Mazak QTN-250 (x3)', description: 'Preventive overhaul — annual contract', estimatedValue: 50700, expectedDate: m(1), probability: 90 },
    { id: 'fc_3', customer: CUSTOMERS.usinagem.name, spindleModel: 'Fischer MFW-2310', description: 'Third unit of the 5-axis line (planned swap)', estimatedValue: 48500, expectedDate: m(2), probability: 60 },
    { id: 'fc_4', customer: CUSTOMERS.moldes.name, spindleModel: 'Fanuc αiI 12', description: 'Awaiting assessment report', estimatedValue: 18500, expectedDate: m(1, 10), probability: 50 },
    { id: 'fc_5', customer: CUSTOMERS.metalforte.name, spindleModel: 'WEG W22 75hp', description: 'December maintenance shutdown', estimatedValue: 21000, expectedDate: m(2, 8), probability: 40 },
    { id: 'fc_6', customer: CUSTOMERS.hidrotec.name, spindleModel: 'Siemens 1FT7 (x2)', description: 'Servo motor retrofit on the pump line', estimatedValue: 29200, expectedDate: m(3), probability: 30 },
    { id: 'fc_7', customer: CUSTOMERS.alfa.name, spindleModel: 'Haas 40-Taper', description: 'Spindle received, awaiting assessment', estimatedValue: 19800, expectedDate: m(0, 12), probability: 70 },
    { id: 'fc_8', customer: CUSTOMERS.textil.name, spindleModel: 'Weiss WS 170', description: 'Renegotiating the declined quote', estimatedValue: 29900, expectedDate: m(4), probability: 20 },
  ];

  // ───────────── Projetos, alocações e férias ─────────────
  // wd(n) = n dias úteis a partir da segunda-feira desta semana (n pode ser negativo).
  const wd = (n: number) => addBusinessDays(week, n);
  const shop = { name: 'Weiss workshop (bench)', address: SHOP_ADDRESS };
  const statusFor = (start: string, end: string): Project['status'] =>
    end < today ? 'completed' : start <= today ? 'in_progress' : 'planned';

  const prj = (
    n: number,
    customer: { name: string; address: string },
    serviceType: Project['serviceType'],
    description: string,
    color: string,
    span: [string, string],
    extra: Partial<Project> = {},
  ): Project => ({
    id: `prj_${String(n).padStart(3, '0')}`,
    projectNumber: DEMO_PROJECT_NUMBERS[n - 1]!,
    customer: customer.name,
    // Endereços reais dos clientes ainda não preenchidos (TBC): só o país.
    address: customer.address === 'United Kingdom' ? '' : customer.address,
    country: 'United Kingdom',
    serviceType: SERVICE_TYPE_TEXT[serviceType] ?? serviceType,
    description,
    status: statusFor(span[0], span[1]),
    color,
    materials: [],
    ...extra,
  });

  const projects: Project[] = [
    prj(1, CUSTOMERS.usinagem, 'bench_repair', 'Full repair + installation of Fischer MFW-2310 spindle (S/N FS-22871)', '#2563eb', [wd(-3), wd(12)], {
      poId: 'po_4500918',
      spindleId: 'sp_fs22871',
      // Horas previstas por fase (demonstra as cores: dentro, perto, no limite, acima).
      phaseForecast: { ph_1: 5, ph_2: 4, ph_3: 4, ph_4: 8.5, ph_6: 6, ph_7: 2 },
      materials: [
        { id: 'mat_01', requisitionId: 'rc_1', partNumber: 'SKF-7014CD/P4A', description: 'SKF 7014 CD/P4A angular contact bearing (pair)', quantity: 2, status: 'ordered', poId: 'po_skf33012', poLineId: 'pol_9', neededBy: wd(-1) },
        { id: 'mat_02', requisitionId: 'rc_1', partNumber: 'SKF-7012ACD/HCP4A', description: 'SKF 7012 ACD/HCP4A hybrid bearing (pair)', quantity: 1, status: 'ordered', poId: 'po_skf33012', poLineId: 'pol_10', neededBy: wd(1) },
        { id: 'mat_03', requisitionId: 'rc_1', partNumber: 'KLU-ISOFLEX-NBU15', description: 'Klüber Isoflex NBU 15 grease (50 g)', quantity: 4, status: 'ordered', poId: 'po_skf33012', poLineId: 'pol_11', neededBy: wd(2) },
        { id: 'mat_04', partNumber: 'FIS-RET-2310', description: 'Fischer MFW-2310 front labyrinth seal', quantity: 1, status: 'to_buy', neededBy: wd(3) },
      ],
    }),
    prj(2, CUSTOMERS.moldes, 'bench_repair', 'IBAG HF 120 spindle repair (S/N IB-8812) + vibration test', '#7c3aed', [wd(5), wd(15)], {
      poId: 'po_mmj0457',
      spindleId: 'sp_ib8812',
      materials: [
        { id: 'mat_05', requisitionId: 'rc_2', partNumber: 'IBG-SEAL-KIT-HF120', description: 'IBAG HF 120 seal kit', quantity: 1, status: 'ordered', poId: 'po_cmp4471', poLineId: 'cmp_1', neededBy: wd(5) },
        { id: 'mat_06', requisitionId: 'rc_5', partNumber: 'PT100-M8', description: 'PT100 temperature sensor, M8 thread', quantity: 2, status: 'requested', neededBy: wd(7) },
        { id: 'mat_12', requisitionId: 'rc_5', partNumber: 'KLU-ISOFLEX-NBU15', description: 'Klüber Isoflex NBU 15 grease (50 g)', quantity: 2, status: 'requested', neededBy: wd(6) },
      ],
    }),
    prj(3, CUSTOMERS.metalforte, 'site_visit', 'Alignment inspection — press line + WEG motor collection', '#d97706', [wd(-6), wd(2)], {
      poId: 'po_mf2291',
      spindleId: 'sp_weg30',
      materials: [{ id: 'mat_07', partNumber: 'CU-ESM-1.2', description: 'Enamelled copper wire 1.2 mm (kg)', quantity: 18, status: 'received' }],
    }),
    prj(4, CUSTOMERS.alfa, 'installation', 'Kessler DMS 120 motor spindle retrofit — diagnosis, bench work and installation', '#16a34a', [wd(0), wd(13)], {
      poId: 'po_alf1120',
      spindleId: 'sp_ks30419',
      materials: [
        { id: 'mat_08', requisitionId: 'rc_3', partNumber: 'HEID-ERN1387', description: 'Encoder Heidenhain ERN 1387 2048 ppr', quantity: 1, status: 'ordered', poId: 'po_cmp4471', poLineId: 'cmp_2', neededBy: wd(10) },
        { id: 'mat_09', partNumber: 'CER-7010-P4', description: '7010 P4 ceramic bearing (pair)', quantity: 1, status: 'to_buy', neededBy: wd(10) },
        { id: 'mat_10', partNumber: 'HSK-A63-CAL', description: 'HSK-A63 calibration bar', quantity: 1, status: 'received' },
        { id: 'mat_13', partNumber: 'PT100-M8', description: 'PT100 temperature sensor, M8 thread', quantity: 1, status: 'to_buy', neededBy: wd(10) },
      ],
    }),
    prj(5, CUSTOMERS.aeromec, 'site_visit', 'Site survey and pre-installation of GMN HCS 170 spindle', '#db2777', [wd(-1), wd(5)], { spindleId: 'sp_gmn' }),
    prj(6, CUSTOMERS.autopecas, 'site_visit', 'Preventive overhaul of Mazak QTN-250 lathes (3 spindles)', '#0891b2', [wd(0), wd(14)], {
      poId: 'po_avp8810',
      spindleId: 'sp_mz1',
      materials: [{ id: 'mat_11', requisitionId: 'rc_4', partNumber: 'MAZ-REV-KIT', description: 'Mazak overhaul kit (bearings + seals)', quantity: 3, status: 'requested', neededBy: wd(8) }],
    }),
    prj(7, CUSTOMERS.hidrotec, 'installation', 'Siemens 1FT7 servo motor reinstallation + commissioning', '#65a30d', [wd(-4), wd(-2)], { poId: 'po_hid5502', spindleId: 'sp_sie1ft7' }),
    prj(8, CUSTOMERS.hidrotec, 'site_visit', 'Proposal for servo motor retrofit on the pump line', '#ea580c', [wd(6), wd(7)]),
    prj(9, CUSTOMERS.textil, 'site_visit', 'Weiss WS 170 assessment and renegotiation', '#4f46e5', [wd(-15), wd(12)], { spindleId: 'sp_weiss' }),
    prj(10, shop, 'bench_repair', 'Balancing bench maintenance', '#64748b', [wd(16), wd(17)]),
  ];

  let an = 0;
  const asg = (projectId: string, employeeId: string, start: string, end: string): ProjectAssignment => ({
    id: `asg_${String(++an).padStart(3, '0')}`,
    projectId,
    employeeId,
    startDate: start,
    endDate: end,
  });

  const assignments: ProjectAssignment[] = [
    // Emma — campo (um projeto por vez; um projeto tem uma pessoa por vez)
    asg('prj_003', 'emp_carlos', wd(-6), wd(-4)),
    asg('prj_004', 'emp_carlos', wd(0), wd(3)),
    asg('prj_005', 'emp_carlos', wd(4), wd(5)),
    asg('prj_006', 'emp_carlos', wd(8), wd(14)),
    // Dave — bancada
    asg('prj_001', 'emp_juliana', wd(-3), wd(4)),
    asg('prj_002', 'emp_juliana', wd(5), wd(9)),
    asg('prj_004', 'emp_juliana', wd(10), wd(13)),
    // Rupert — instalação (férias wd(1)..wd(10))
    asg('prj_007', 'emp_marcos', wd(-4), wd(-2)),
    asg('prj_001', 'emp_marcos', wd(11), wd(12)),
    asg('prj_002', 'emp_marcos', wd(14), wd(15)),
    // Owen — engenharia de aplicação
    asg('prj_005', 'emp_patricia', wd(-1), wd(1)),
    asg('prj_008', 'emp_patricia', wd(6), wd(7)),
    asg('prj_009', 'emp_patricia', wd(12), wd(12)),
    asg('prj_010', 'emp_patricia', wd(16), wd(17)),
    // Nigel — logística (coletas/entregas curtas)
    asg('prj_006', 'emp_rafael', wd(0), wd(0)),
    asg('prj_003', 'emp_rafael', wd(2), wd(2)),
    asg('prj_001', 'emp_rafael', wd(10), wd(10)),
    asg('prj_002', 'emp_rafael', wd(11), wd(11)),
    // Jaimie (inativo) — histórico
    asg('prj_009', 'emp_eduardo', wd(-15), wd(-12)),
  ];

  const absences: Absence[] = [
    { id: 'abs_1', employeeId: 'emp_marcos', type: 'vacation', startDate: wd(1), endDate: wd(10), note: 'Annual leave' },
    { id: 'abs_2', employeeId: 'emp_rafael', type: 'training', startDate: wd(15), endDate: wd(16), note: 'Forklift training' },
    { id: 'abs_3', employeeId: 'emp_juliana', type: 'vacation', startDate: wd(25), endDate: wd(34), note: 'Annual leave' },
  ];

  // ───────────── Fornecedores & catálogo de materiais ─────────────
  const suppliers: Supplier[] = [
    { id: 'sup_rp', name: 'Precision Bearings UK', contactName: 'Martin Andrews', email: 'sales@example.com', phone: '01632 960101', notes: 'Precision bearings from stock.' },
    { id: 'sup_skf', name: 'SKF (UK)', contactName: 'Rachel King', email: 'rachel.king@example.com', phone: '01632 960102', notes: 'Direct purchase; best price, long lead time.' },
    { id: 'sup_cip', name: 'Midlands Industrial Components', contactName: 'Daniel Ford', email: 'daniel@example.com', phone: '01632 960103', notes: '' },
    { id: 'sup_fis', name: 'Fischer Spindle Group', contactName: 'Thomas Weber', email: 'service@example.com', phone: '+41 32 000 0000', notes: 'Genuine Fischer parts (imported).' },
    { id: 'sup_klu', name: 'Klüber Lubrication', contactName: 'Paula Reed', email: 'paula.reed@example.com', phone: '01632 960104', notes: '' },
    { id: 'sup_sen', name: 'Sensortec Automation', contactName: 'Ben Lewis', email: 'sales.sensortec@example.com', phone: '01632 960105', notes: 'Sensors and encoders.' },
  ];

  const q = (supplierId: string, leadTimeDays: number, quotedPrice?: number, quoteStatus: SupplierOffer['quoteStatus'] = quotedPrice ? 'received' : 'not_requested'): SupplierOffer => ({
    supplierId,
    leadTimeDays,
    quoteStatus,
    quotedPrice,
    quoteDate: quotedPrice ? d(-6) : undefined,
    validUntil: quotedPrice ? d(24) : undefined,
  });

  const materials: CatalogMaterial[] = [
    { id: 'cm_01', partNumber: 'SKF-7014CD/P4A', description: 'SKF 7014 CD/P4A angular contact bearing (pair)', unit: 'pair', offers: [q('sup_rp', 5, 2950), q('sup_skf', 25, 2780)], plants: ['DE01', 'UK01'] },
    { id: 'cm_02', partNumber: 'SKF-7012ACD/HCP4A', description: 'SKF 7012 ACD/HCP4A hybrid bearing (pair)', unit: 'pair', offers: [q('sup_rp', 7, 4380), q('sup_skf', 30, 4120)], plants: ['DE01', 'UK01'] },
    { id: 'cm_03', partNumber: 'KLU-ISOFLEX-NBU15', description: 'Klüber Isoflex NBU 15 grease (50 g)', unit: 'pc', offers: [q('sup_rp', 3, 189), q('sup_klu', 10, undefined, 'requested')], plants: ['DE01', 'UK01'] },
    { id: 'cm_04', partNumber: 'FIS-RET-2310', description: 'Fischer MFW-2310 front labyrinth seal', unit: 'pc', offers: [q('sup_fis', 15, 2350), q('sup_cip', 10)], plants: ['DE01'] },
    { id: 'cm_05', partNumber: 'IBG-SEAL-KIT-HF120', description: 'IBAG HF 120 seal kit', unit: 'kit', offers: [q('sup_cip', 7, 1450)], plants: ['DE01', 'UK01'] },
    { id: 'cm_06', partNumber: 'PT100-M8', description: 'PT100 temperature sensor, M8 thread', unit: 'pc', offers: [q('sup_sen', 4), q('sup_cip', 6)], plants: ['UK01'] },
    { id: 'cm_07', partNumber: 'HEID-ERN1387', description: 'Encoder Heidenhain ERN 1387 2048 ppr', unit: 'pc', offers: [q('sup_cip', 10, 6890), q('sup_sen', 14, undefined, 'requested')], plants: ['DE01', 'UK01'] },
    { id: 'cm_08', partNumber: 'CER-7010-P4', description: '7010 P4 ceramic bearing (pair)', unit: 'pair', offers: [q('sup_skf', 30, 3600), q('sup_rp', 8, undefined, 'requested')], plants: ['DE01'] },
    { id: 'cm_09', partNumber: 'MAZ-REV-KIT', description: 'Mazak overhaul kit (bearings + seals)', unit: 'kit', offers: [q('sup_rp', 12, undefined, 'requested')], plants: ['DE01'] },
    { id: 'cm_10', partNumber: 'CU-ESM-1.2', description: 'Enamelled copper wire 1.2 mm', unit: 'kg', offers: [q('sup_cip', 2, 98)], plants: ['UK01'] },
  ];

  // ───────────── Usuários (PINs de demonstração: master 1234 · logística 2222 · office 3333) ─────────────
  const users: User[] = [
    { id: 'u_master', name: 'Master', email: 'master@example.com', role: 'master', active: true, pinHash: 'b774a85f8d387dc709a6e20d472cd068a5bbe6b5db30de078c2f1aafb6457f4b' },
    { id: 'u_log', name: 'Logistics', email: 'logistics@example.com', role: 'logistics', active: true, pinHash: 'ef5d4d355443e093221677951b66fea54aecb94093554dc6bc17a4cc99b5a421' },
    { id: 'u_office', name: 'Office', email: 'office@example.com', role: 'office', active: true, pinHash: '3eb68b61daf4f7b7bf0e5e918c9acecca1ca4d8d98432ffd793989739046fa0e' },
  ];

  // ───────────── Requisições de compra ─────────────
  const ev = (at: string, userId: string, action: RequisitionEvent['action'], note = ''): RequisitionEvent => ({ at: `${at}T10:00:00`, userId, action, note });
  const ri = (id: string, materialId: string, partNumber: string, description: string, quantity: number): RequisitionItem => ({ id, materialId, partNumber, description, quantity });
  const requisitions: PurchaseRequisition[] = [
    {
      id: 'rc_1', number: 'RC-00001', projectId: 'prj_001', requestedBy: 'u_office', requestedAt: d(-10), neededBy: wd(-1), status: 'quoting', notes: 'Bearings and grease for the Fischer FS-22871 repair.',
      items: [ri('ri_1', 'mat_01', 'SKF-7014CD/P4A', 'SKF 7014 CD/P4A angular contact bearing (pair)', 2), ri('ri_2', 'mat_02', 'SKF-7012ACD/HCP4A', 'SKF 7012 ACD/HCP4A hybrid bearing (pair)', 1), ri('ri_3', 'mat_03', 'KLU-ISOFLEX-NBU15', 'Klüber Isoflex NBU 15 grease (50 g)', 4)],
      history: [ev(d(-10), 'u_office', 'submitted'), ev(d(-10), 'u_log', 'quoting'), ev(d(-9), 'u_log', 'po_registered', 'PO 4500391122 — Precision Bearings UK'), ev(d(-5), 'u_log', 'gr_registered', 'GR 5000418871 — SKF-7014CD/P4A × 4')],
    },
    {
      id: 'rc_2', number: 'RC-00002', projectId: 'prj_002', requestedBy: 'u_office', requestedAt: d(-8), neededBy: wd(5), status: 'quoting', notes: '',
      items: [ri('ri_4', 'mat_05', 'IBG-SEAL-KIT-HF120', 'IBAG HF 120 seal kit', 1)],
      history: [ev(d(-8), 'u_office', 'submitted'), ev(d(-8), 'u_log', 'quoting'), ev(d(-7), 'u_log', 'po_registered', 'PO 4500391187 — Midlands Industrial Components')],
    },
    {
      id: 'rc_3', number: 'RC-00003', projectId: 'prj_004', requestedBy: 'u_office', requestedAt: d(-8), neededBy: wd(10), status: 'quoting', notes: 'Genuine Heidenhain encoder.',
      items: [ri('ri_5', 'mat_08', 'HEID-ERN1387', 'Encoder Heidenhain ERN 1387 2048 ppr', 1)],
      history: [ev(d(-8), 'u_office', 'submitted'), ev(d(-7), 'u_log', 'po_registered', 'PO 4500391187 — Midlands Industrial Components'), ev(d(-3), 'u_log', 'gr_registered', 'GR 5000419020 — HEID-ERN1387 × 1')],
    },
    {
      id: 'rc_4', number: 'RC-00004', projectId: 'prj_006', requestedBy: 'u_office', requestedAt: d(-2), neededBy: wd(8), status: 'quoting', notes: 'Kits for the 3 Mazak spindles.',
      items: [ri('ri_6', 'mat_11', 'MAZ-REV-KIT', 'Mazak overhaul kit (bearings + seals)', 3)],
      history: [ev(d(-2), 'u_office', 'submitted'), ev(d(-1), 'u_log', 'quoting', 'Quote requested from Precision Bearings UK.')],
    },
    {
      id: 'rc_5', number: 'RC-00005', projectId: 'prj_002', requestedBy: 'u_office', requestedAt: d(-1), neededBy: wd(6), status: 'submitted', notes: '',
      items: [ri('ri_7', 'mat_06', 'PT100-M8', 'PT100 temperature sensor, M8 thread', 2), ri('ri_8', 'mat_12', 'KLU-ISOFLEX-NBU15', 'Klüber Isoflex NBU 15 grease (50 g)', 2)],
      history: [ev(d(-1), 'u_office', 'submitted')],
    },
  ];

  // GR nas linhas já entregues das POs de compra.
  let gr = 5000418800;
  const withReceipts = purchaseOrders.map((po) =>
    po.kind !== 'purchase'
      ? po
      : {
          ...po,
          lines: po.lines.map((l) =>
            l.status === 'delivered'
              ? { ...l, receipts: [{ id: `gr_${l.id}`, grNumber: l.id === 'pol_9' ? '5000418871' : l.id === 'cmp_2' ? '5000419020' : String(++gr), date: l.actualDeliveryDate ?? l.expectedDeliveryDate, quantity: l.quantity, receivedBy: 'u_log', notes: '' }] }
              : l,
          ),
        },
  );

  // ───────────── Extensões de material (SAP) ─────────────
  const xev = (at: string, userId: string, action: ExtensionEvent['action'], note = ''): ExtensionEvent => ({ at: `${at}T09:30:00`, userId, action, note });
  const extensions: MaterialExtensionRequest[] = [
    {
      id: 'ext_1', number: 'EXT-00001', partNumber: 'MAZ-REV-KIT', description: 'Mazak overhaul kit (bearings + seals)', supplierId: 'sup_rp',
      fromPlant: 'DE01', toPlant: 'UK01', projectId: 'prj_006', requestedBy: 'u_office', requestedAt: d(-2), neededBy: wd(5), status: 'in_progress', notes: 'Needed for RC-00004.',
      history: [xev(d(-2), 'u_office', 'requested'), xev(d(-1), 'u_log', 'started', 'Requested from the master data team.')],
    },
    {
      id: 'ext_2', number: 'EXT-00002', partNumber: 'CER-7010-P4', description: '7010 P4 ceramic bearing (pair)', supplierId: 'sup_skf',
      fromPlant: 'DE01', toPlant: 'UK01', projectId: 'prj_004', requestedBy: 'u_office', requestedAt: d(-1), neededBy: wd(8), status: 'requested', notes: '',
      history: [xev(d(-1), 'u_office', 'requested')],
    },
    {
      id: 'ext_3', number: 'EXT-00003', partNumber: 'IBG-SEAL-KIT-HF120', description: 'IBAG HF 120 seal kit', supplierId: 'sup_cip',
      fromPlant: 'DE01', toPlant: 'UK01', projectId: 'prj_002', requestedBy: 'u_office', requestedAt: d(-12), status: 'extended', notes: '', sapReference: 'MDG-77120',
      history: [xev(d(-12), 'u_office', 'requested'), xev(d(-11), 'u_log', 'started'), xev(d(-10), 'u_log', 'extended', 'MDG-77120')],
    },
  ];

  // ───────────── Oficina: fases e apontamentos de horas ─────────────
  // Ids fixos (ph_5 = antigo Balancing, removido): apontamentos e migrações dependem deles.
  const workPhases: WorkPhase[] = (
    [
      ['ph_1', 'Disassembly'], ['ph_2', 'Inspection / Diagnosis'], ['ph_3', 'Cleaning'], ['ph_4', 'Reassembly'],
      ['ph_6', 'Testing'], ['ph_7', 'Packaging & Delivery'],
    ] as const
  ).map(([id, name], i) => ({ id, name, order: i + 1, active: true }));
  /** Dias úteis a partir de hoje (apontamentos ficam sempre no passado recente). */
  const bd = (n: number) => addBusinessDays(today, n);
  /** Data/hora local → ISO completo. */
  const at = (date: string, hhmm: string) => {
    const dt = parseISODate(date);
    const [h, mi] = hhmm.split(':').map(Number);
    dt.setHours(h ?? 0, mi ?? 0, 0, 0);
    return dt.toISOString();
  };
  const minutesAgo = (n: number) => new Date(Date.now() - n * 60000).toISOString();
  let te = 0;
  const entry = (employeeId: string, projectId: string, phase: number, start: string, end?: string, extra: Partial<TimeEntry> = {}): TimeEntry => ({
    id: `te_${++te}`, employeeId, projectId, phaseId: `ph_${phase}`, start, end, source: 'qr', note: '', ...extra,
  });
  // Ordem obrigatória: cada fase é concluída ("Concluir fase") antes da próxima; pausa = sem `completesPhase`.
  const done = { completesPhase: true } as const;
  const rawTimeEntries: TimeEntry[] = [
    // 1000HTVB (prj_006): serviço já concluído na oficina (todas as fases) — Emma ficou livre.
    entry('emp_carlos', 'prj_006', 1, at(bd(-6), '08:00'), at(bd(-6), '10:30'), done),
    entry('emp_carlos', 'prj_006', 2, at(bd(-6), '10:30'), at(bd(-6), '16:45'), done),
    entry('emp_carlos', 'prj_006', 3, at(bd(-5), '08:05'), at(bd(-5), '09:40'), done),
    entry('emp_carlos', 'prj_006', 4, at(bd(-5), '09:40'), at(bd(-5), '17:00'), done),
    entry('emp_carlos', 'prj_006', 6, at(bd(-4), '08:00'), at(bd(-4), '15:50'), done),
    entry('emp_carlos', 'prj_006', 7, at(bd(-4), '15:50'), at(bd(-4), '16:40'), done),
    // 1000BKXA (prj_001): Dave nas fases em ordem; Rupert ajudou na limpeza; agora em Teste.
    entry('emp_juliana', 'prj_001', 1, at(bd(-3), '08:02'), at(bd(-3), '12:05'), done),
    entry('emp_juliana', 'prj_001', 2, at(bd(-3), '13:01'), at(bd(-3), '17:10'), done),
    entry('emp_marcos', 'prj_001', 3, at(bd(-2), '08:30'), at(bd(-2), '11:45'), done),
    entry('emp_juliana', 'prj_001', 4, at(bd(-2), '12:00'), at(bd(-2), '16:40')), // pausa (fim do dia)
    entry('emp_juliana', 'prj_001', 4, at(bd(-1), '08:05'), at(bd(-1), '11:30'), done),
    entry('emp_juliana', 'prj_001', 6, minutesAgo(95)),
    // Esqueceu de encerrar ontem: aparece para revisão da supervisão.
    entry('emp_marcos', 'prj_009', 1, at(bd(-1), '14:20')),
    // Em andamento agora.
    entry('emp_patricia', 'prj_004', 1, minutesAgo(40)),
  ];
  const aligned = alignDemoHours(rawTimeEntries, assignments, absences, employees.map((e) => e.id));
  assignments.push(...aligned.added);
  const timeEntries = aligned.entries;

  return {
    users,
    requisitions,
    extensions,
    // PIN do ponto da oficina na demonstração: 1111 para todos.
    employees: employees.map((e) => ({ ...e, clockPinHash: clockPinHash(e.id, '1111') })),
    projects,
    assignments,
    absences,
    purchaseOrders: withReceipts,
    suppliers,
    materials,
    spindles,
    forecast,
    workPhases,
    timeEntries,
    shopfloorRequests: [],
    customers: [],
    projectUpdates: [],
    auditLog: [],
    clients: demoClients(new Date().toISOString()),
  };
}

/** Id dos apontamentos da demonstração (`te_1`, `te_2`…); os reais usam `newId('te')`. */
export const isDemoEntryId = (id: string) => /^te_\d+$/.test(id);

/**
 * Demonstração coerente com a regra "só marca horas quem está na agenda": as horas da demo e a agenda usam âncoras de
 * data diferentes (hoje × segunda-feira), então um apontamento podia cair num dia em que a pessoa não estava escalada.
 * Para cada apontamento da demo fora da agenda: passa para um colaborador escalado nesse projeto nesse dia (sem
 * férias/ausência); se não houver, cria a alocação desse dia na agenda.
 */
export function alignDemoHours(
  entries: readonly TimeEntry[],
  assignments: readonly ProjectAssignment[],
  absences: readonly Absence[],
  employeeIds: readonly string[] = [],
): { entries: TimeEntry[]; added: ProjectAssignment[]; removed: string[]; changed: boolean } {
  const day = (iso: string) => toISODate(new Date(iso));
  const overlaps = (a: ProjectAssignment, b: ProjectAssignment) => a.startDate <= b.endDate && b.startDate <= a.endDate;
  const clashes = (a: ProjectAssignment, list: readonly ProjectAssignment[]) =>
    list.some((b) => b.id !== a.id && overlaps(a, b) && ((b.employeeId === a.employeeId) !== (b.projectId === a.projectId)));
  // Alocações automáticas antigas que ferem "uma pessoa por projeto / um projeto por pessoa" saem e são refeitas.
  const removed = assignments.filter((a) => a.id.startsWith('asg_demo_') && clashes(a, assignments)).map((a) => a.id);
  const all = assignments.filter((a) => !removed.includes(a.id));
  const added: ProjectAssignment[] = [];
  const absent = (emp: string, d: string) => absences.some((a) => a.employeeId === emp && a.startDate <= d && a.endDate >= d);
  const covers = (emp: string, prj: string, d: string) => all.some((a) => a.employeeId === emp && a.projectId === prj && a.startDate <= d && a.endDate >= d);
  const busyElsewhere = (emp: string, prj: string, d: string) => all.some((a) => a.employeeId === emp && a.projectId !== prj && a.startDate <= d && a.endDate >= d);
  const pool = [...new Set([...employeeIds, ...all.map((a) => a.employeeId), ...entries.map((e) => e.employeeId)])];
  let changed = removed.length > 0;
  const out = entries.map((e) => {
    const d = day(e.start);
    if (!isDemoEntryId(e.id) || covers(e.employeeId, e.projectId, d)) return e;
    if (all.some((a) => a.id === `asg_demo_${e.id}`)) return e;
    changed = true;
    // Alguém já está no projeto nesse dia: a hora é dele (uma pessoa por projeto).
    const other = all.find((a) => a.projectId === e.projectId && a.startDate <= d && a.endDate >= d && !absent(a.employeeId, d));
    if (other) return { ...e, employeeId: other.employeeId };
    // Ninguém no projeto: quem marcou, se estiver livre; senão outro colaborador livre nesse dia.
    const emp = [e.employeeId, ...pool].find((x) => !absent(x, d) && !busyElsewhere(x, e.projectId, d));
    if (!emp) return e;
    const asg: ProjectAssignment = { id: `asg_demo_${e.id}`, projectId: e.projectId, employeeId: emp, startDate: d, endDate: d };
    all.push(asg);
    added.push(asg);
    return emp === e.employeeId ? e : { ...e, employeeId: emp };
  });
  return { entries: out, added, removed, changed };
}
