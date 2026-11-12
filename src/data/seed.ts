/**
 * Dados de demonstração realistas (reparo de spindles e motores industriais).
 * Todas as datas são RELATIVAS ao dia em que o seed é gerado, para que a demo
 * sempre mostre atividades da semana, POs atrasadas, entregas do mês etc.
 */
import { addBusinessDays, addDays, addMonths, startOfWeek, todayISO } from '@/lib/dates';
import type {
  Absence,
  AppDatabase,
  CatalogMaterial,
  Employee,
  ForecastItem,
  POLineItem,
  Project,
  ProjectAssignment,
  PurchaseOrder,
  SpindleUnit,
  Supplier,
  SupplierOffer,
} from '@/types/models';

const CUSTOMERS = {
  usinagem: { name: 'Usinagem Precisa Ltda', address: 'Rua Dr. Ricardo Benetton Martins, 1000 - Polo II de Alta Tecnologia, Campinas - SP' },
  metalforte: { name: 'MetalForte Indústria Mecânica', address: 'Av. Itavuvu, 4300 - Jardim Santa Cecília, Sorocaba - SP' },
  aeromec: { name: 'Aeromec Componentes Aeronáuticos', address: 'Av. Brigadeiro Faria Lima, 1500 - Jardim Bela Vista, São José dos Campos - SP' },
  moldes: { name: 'Moldes & Matrizes Jundiaí', address: 'Av. Antônio Frederico Ozanam, 6000 - Vila Rio Branco, Jundiaí - SP' },
  alfa: { name: 'Ferramentaria Alfa', address: 'Av. Fábio Eduardo Ramos Esquivel, 2000 - Centro, Diadema - SP' },
  autopecas: { name: 'AutoPeças Vale do Paraíba', address: 'Rod. Presidente Dutra, km 138 - Eugênio de Melo, São José dos Campos - SP' },
  hidrotec: { name: 'Hidrotec Bombas Industriais', address: 'Av. Santos Dumont, 1500 - Cumbica, Guarulhos - SP' },
  textil: { name: 'Têxtil Americana S.A.', address: 'Av. Brasil, 2500 - Jardim Ipiranga, Americana - SP' },
} as const;

const SHOP_ADDRESS = 'Rua Hermínio Rodrigues, 200 - Distrito Industrial, Valinhos - SP';

const employees: Employee[] = [
  { id: 'emp_carlos', name: 'Carlos Menezes', role: 'Técnico de Campo Sênior', phone: '(19) 99812-4501', email: 'carlos.menezes@spindleops.com.br', color: '#2563eb', status: 'active' },
  { id: 'emp_juliana', name: 'Juliana Prado', role: 'Técnica de Bancada (Balanceamento)', phone: '(19) 99745-2290', email: 'juliana.prado@spindleops.com.br', color: '#7c3aed', status: 'active' },
  { id: 'emp_rafael', name: 'Rafael Souza', role: 'Motorista / Logística', phone: '(19) 98123-7788', email: 'rafael.souza@spindleops.com.br', color: '#d97706', status: 'active' },
  { id: 'emp_marcos', name: 'Marcos Oliveira', role: 'Técnico de Instalação', phone: '(19) 99654-3312', email: 'marcos.oliveira@spindleops.com.br', color: '#16a34a', status: 'active' },
  { id: 'emp_patricia', name: 'Patrícia Lima', role: 'Engenheira de Aplicação', phone: '(11) 97411-9054', email: 'patricia.lima@spindleops.com.br', color: '#db2777', status: 'active' },
  { id: 'emp_eduardo', name: 'Eduardo Tanaka', role: 'Técnico de Campo', phone: '(19) 99288-6610', email: 'eduardo.tanaka@spindleops.com.br', color: '#0891b2', status: 'inactive' },
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
      requester: 'Eng. Fábio Ramos', paymentTerms: '28 DDL', status: 'partial',
      notes: 'Reparo de 2 spindles da linha de centros de usinagem 5 eixos. Prioridade alta.',
      attachments: [{ id: 'att_1', name: 'PO 4500918.pdf', url: 'https://example.com/po/4500918.pdf', type: 'po_pdf' }],
      lines: [
        line('pol_1', 10, 'SRV-FIS-MFW2310', 'Reparo completo spindle Fischer MFW-2310 (S/N FS-22871)', 1, 48500, d(-3), 'open'),
        line('pol_2', 20, 'SRV-FIS-MFW2310', 'Reparo completo spindle Fischer MFW-2310 (S/N FS-22904)', 1, 48500, d(-10), 'delivered', d(-11)),
        line('pol_3', 30, 'SRV-BAL-G1', 'Balanceamento dinâmico G1.0 adicional', 2, 1850, d(4), 'open'),
      ],
    },
    {
      id: 'po_mf2291', poNumber: 'MF-2291', kind: 'sales', customerOrVendor: CUSTOMERS.metalforte.name, orderDate: d(-12),
      requester: 'Sandra Pires (Compras)', paymentTerms: '30/60 DDL', status: 'open',
      notes: 'Motor WEG W22 queimado — rebobinamento + troca de rolamentos.',
      attachments: [{ id: 'att_2', name: 'Pedido MF-2291.pdf', url: 'https://example.com/po/MF-2291.pdf', type: 'po_pdf' }],
      lines: [
        line('pol_4', 1, 'SRV-WEG-W22-RB', 'Rebobinamento motor WEG W22 30cv 4P', 1, 9800, d(5), 'open'),
        line('pol_5', 2, 'ROL-6312-2Z', 'Rolamento SKF 6312-2Z/C3', 2, 640, d(5), 'open'),
      ],
    },
    {
      id: 'po_aer7731', poNumber: 'AER-7731', kind: 'sales', customerOrVendor: CUSTOMERS.aeromec.name, orderDate: d(-40),
      requester: 'Eng. Ricardo Alves', paymentTerms: '45 DDL', status: 'invoiced',
      notes: 'Spindle Step-Tec HVC 140 — certificado de teste anexado à NF.',
      attachments: [
        { id: 'att_3', name: 'PO AER-7731.pdf', url: 'https://example.com/po/AER-7731.pdf', type: 'po_pdf' },
        { id: 'att_4', name: 'NF-e 18842.pdf', url: 'https://example.com/nf/18842.pdf', type: 'invoice' },
      ],
      lines: [line('pol_6', 1, 'SRV-STT-HVC140', 'Reparo spindle Step-Tec HVC 140 (S/N ST-51022)', 1, 62300, d(-15), 'delivered', d(-14))],
    },
    {
      id: 'po_mmj0457', poNumber: 'MMJ-0457', kind: 'sales', customerOrVendor: CUSTOMERS.moldes.name, orderDate: d(-18),
      requester: 'Luiz Fernando', paymentTerms: '28 DDL', status: 'open',
      notes: 'Spindle de alta rotação para fresamento de moldes. Cliente solicitou teste de vibração.',
      attachments: [],
      lines: [
        line('pol_7', 1, 'SRV-IBG-HF120', 'Reparo spindle IBAG HF 120 (S/N IB-8812)', 1, 27400, d(-2), 'open'),
        line('pol_8', 2, 'SRV-VIB-RPT', 'Relatório de análise de vibração', 1, 1200, d(-2), 'open'),
      ],
    },
    {
      id: 'po_skf33012', poNumber: 'SKF-33012', kind: 'purchase', supplierId: 'sup_rp', customerOrVendor: 'Rolamentos Paulista Distribuidora', orderDate: d(-9),
      requester: 'Juliana Prado', paymentTerms: '30 DDL', status: 'partial',
      notes: 'Compra de rolamentos de precisão para estoque de bancada.',
      attachments: [{ id: 'att_5', name: 'Cotação RP-1188.pdf', url: 'https://example.com/forn/RP-1188.pdf', type: 'other' }],
      lines: [
        line('pol_9', 1, 'SKF-7014CD/P4A', 'Rolamento de contato angular SKF 7014 CD/P4A (par)', 4, 2950, d(-4), 'delivered', d(-5)),
        line('pol_10', 2, 'SKF-7012ACD/HCP4A', 'Rolamento híbrido SKF 7012 ACD/HCP4A (par)', 2, 4380, d(-1), 'open'),
        line('pol_11', 3, 'KLU-ISOFLEX-NBU15', 'Graxa Klüber Isoflex NBU 15 (50g)', 10, 189, d(3), 'open'),
      ],
    },
    {
      id: 'po_cmp4471', poNumber: 'CIP-4471', kind: 'purchase', supplierId: 'sup_cip', customerOrVendor: 'Componentes Industriais Paulista', orderDate: d(-7),
      requester: 'Juliana Prado', paymentTerms: '28 DDL', status: 'partial',
      notes: 'Materiais para projetos IBAG HF 120 e Kessler DMS 120.',
      attachments: [],
      lines: [
        line('cmp_1', 1, 'IBG-SEAL-KIT-HF120', 'Kit de vedação IBAG HF 120', 1, 1450, d(2), 'open'),
        line('cmp_2', 2, 'HEID-ERN1387', 'Encoder Heidenhain ERN 1387 2048 ppr', 1, 6890, d(-3), 'delivered', d(-3)),
      ],
    },
    {
      id: 'po_rp0981', poNumber: 'RP-0981', kind: 'purchase', supplierId: 'sup_rp', customerOrVendor: 'Rolamentos Paulista Distribuidora', orderDate: m(-2, -10),
      requester: 'Juliana Prado', paymentTerms: '28 DDL', status: 'invoiced',
      notes: 'Reposição de estoque de bancada.',
      attachments: [{ id: 'att_8', name: 'NF 55120.pdf', url: 'https://example.com/forn/nf55120.pdf', type: 'invoice' }],
      lines: [
        line('rp_1', 1, 'SKF-7014CD/P4A', 'Rolamento de contato angular SKF 7014 CD/P4A (par)', 2, 2890, m(-2, -5), 'delivered', m(-2, -6)),
        line('rp_2', 2, 'KLU-ISOFLEX-NBU15', 'Graxa Klüber Isoflex NBU 15 (50g)', 6, 175, m(-2, -5), 'delivered', m(-2, -5)),
      ],
    },
    {
      id: 'po_skf2210', poNumber: 'SKF-2210', kind: 'purchase', supplierId: 'sup_skf', customerOrVendor: 'SKF do Brasil', orderDate: m(-4, -3),
      requester: 'Juliana Prado', paymentTerms: '45 DDL', status: 'invoiced',
      notes: 'Compra direta — prazo longo.',
      attachments: [],
      lines: [
        line('skf_1', 1, 'SKF-7014CD/P4A', 'Rolamento de contato angular SKF 7014 CD/P4A (par)', 4, 2780, m(-4, 18), 'delivered', m(-4, 20)),
        line('skf_2', 2, 'SKF-7012ACD/HCP4A', 'Rolamento híbrido SKF 7012 ACD/HCP4A (par)', 2, 4120, m(-4, 18), 'delivered', m(-4, 20)),
      ],
    },
    {
      id: 'po_alf1120', poNumber: 'ALF-1120', kind: 'sales', customerOrVendor: CUSTOMERS.alfa.name, orderDate: d(-6),
      requester: 'Marta Gonçalves', paymentTerms: 'À vista', status: 'open',
      notes: 'Retrofit de eletrospindle Kessler + instalação em campo.',
      attachments: [{ id: 'att_6', name: 'PO ALF-1120.pdf', url: 'https://example.com/po/ALF-1120.pdf', type: 'po_pdf' }],
      lines: [
        line('pol_12', 1, 'SRV-KES-DMS120', 'Reparo eletrospindle Kessler DMS 120 (S/N KS-30419)', 1, 39800, d(9), 'open'),
        line('pol_13', 2, 'SRV-INST-CAMPO', 'Instalação e alinhamento em campo (8h)', 1, 3200, d(11), 'open'),
      ],
    },
    {
      id: 'po_hid5502', poNumber: 'HID-5502', kind: 'sales', customerOrVendor: CUSTOMERS.hidrotec.name, orderDate: d(-55),
      requester: 'Paulo Cesar', paymentTerms: '28 DDL', status: 'delivered',
      notes: 'Servomotor Siemens 1FT7 — troca de encoder e rolamentos.',
      attachments: [{ id: 'att_7', name: 'PO HID-5502.pdf', url: 'https://example.com/po/HID-5502.pdf', type: 'po_pdf' }],
      lines: [line('pol_14', 1, 'SRV-SIE-1FT7', 'Reparo servomotor Siemens 1FT7086 + encoder', 1, 14600, d(-30), 'delivered', d(-28))],
    },
    {
      id: 'po_avp8810', poNumber: 'AVP-8810', kind: 'sales', customerOrVendor: CUSTOMERS.autopecas.name, orderDate: d(-3),
      requester: 'Eng. Camila Duarte', paymentTerms: '60 DDL', status: 'open',
      notes: '3 spindles de torno Mazak para revisão preventiva.',
      attachments: [],
      lines: [
        line('pol_15', 1, 'SRV-MAZ-PREV', 'Revisão preventiva spindle Mazak QTN-250', 3, 16900, d(20), 'open'),
        line('pol_16', 2, 'SRV-FRETE', 'Frete coleta/entrega dedicado', 2, 850, d(6), 'open'),
      ],
    },
    {
      id: 'po_tex0091', poNumber: 'TEX-0091', kind: 'sales', customerOrVendor: CUSTOMERS.textil.name, orderDate: d(-70),
      requester: 'Roberto Nunes', paymentTerms: '28 DDL', status: 'canceled',
      notes: 'Cancelada pelo cliente — equipamento substituído.',
      attachments: [],
      lines: [line('pol_17', 1, 'SRV-WEG-W22-RB', 'Rebobinamento motor WEG W22 50cv', 1, 13200, d(-50), 'canceled')],
    },
  ];

  // ───────────── Spindles / Motores ─────────────
  const spindles: SpindleUnit[] = [
    { id: 'sp_fs22871', serialNumber: 'FS-22871', model: 'MFW-2310', manufacturer: 'Fischer', customer: CUSTOMERS.usinagem.name, receivedDate: d(-30), quoteNumber: 'COT-2611-014', quotedValue: 48500, quoteStatus: 'approved', status: 'testing', poId: 'po_4500918' },
    { id: 'sp_fs22904', serialNumber: 'FS-22904', model: 'MFW-2310', manufacturer: 'Fischer', customer: CUSTOMERS.usinagem.name, receivedDate: d(-30), quoteNumber: 'COT-2611-015', quotedValue: 48500, quoteStatus: 'approved', status: 'delivered', deliveryDate: d(-11), poId: 'po_4500918', invoicedValue: 48500 },
    { id: 'sp_weg30', serialNumber: 'WEG-1022871', model: 'W22 30cv 4P', manufacturer: 'WEG', customer: CUSTOMERS.metalforte.name, receivedDate: d(-14), quoteNumber: 'COT-2611-021', quotedValue: 11080, quoteStatus: 'approved', status: 'in_repair', poId: 'po_mf2291' },
    { id: 'sp_st51022', serialNumber: 'ST-51022', model: 'HVC 140', manufacturer: 'Step-Tec', customer: CUSTOMERS.aeromec.name, receivedDate: d(-45), quoteNumber: 'COT-2610-033', quotedValue: 62300, quoteStatus: 'approved', status: 'delivered', deliveryDate: d(-14), poId: 'po_aer7731', invoicedValue: 62300 },
    { id: 'sp_ib8812', serialNumber: 'IB-8812', model: 'HF 120', manufacturer: 'IBAG', customer: CUSTOMERS.moldes.name, receivedDate: d(-21), quoteNumber: 'COT-2611-009', quotedValue: 28600, quoteStatus: 'approved', status: 'in_repair', poId: 'po_mmj0457' },
    { id: 'sp_ks30419', serialNumber: 'KS-30419', model: 'DMS 120', manufacturer: 'Kessler', customer: CUSTOMERS.alfa.name, receivedDate: d(-8), quoteNumber: 'COT-2611-027', quotedValue: 39800, quoteStatus: 'approved', status: 'approved', poId: 'po_alf1120' },
    { id: 'sp_sie1ft7', serialNumber: 'SIE-1FT7086-88', model: '1FT7086 Servo', manufacturer: 'Siemens', customer: CUSTOMERS.hidrotec.name, receivedDate: d(-60), quoteNumber: 'COT-2609-041', quotedValue: 14600, quoteStatus: 'approved', status: 'delivered', deliveryDate: d(-28), poId: 'po_hid5502', invoicedValue: 14600 },
    { id: 'sp_mz1', serialNumber: 'MZ-QTN-77120', model: 'QTN-250 Spindle', manufacturer: 'Mazak', customer: CUSTOMERS.autopecas.name, receivedDate: d(-2), quoteNumber: 'COT-2611-031', quotedValue: 16900, quoteStatus: 'sent', status: 'quoted', poId: 'po_avp8810' },
    { id: 'sp_gmn', serialNumber: 'GMN-170-4471', model: 'HCS 170', manufacturer: 'GMN', customer: CUSTOMERS.aeromec.name, receivedDate: d(-6), quoteNumber: 'COT-2611-029', quotedValue: 54200, quoteStatus: 'sent', status: 'quoted' },
    { id: 'sp_fanuc', serialNumber: 'FAN-A06B-0247', model: 'αiI 12/10000', manufacturer: 'Fanuc', customer: CUSTOMERS.moldes.name, receivedDate: d(-4), quoteNumber: 'COT-2611-030', quotedValue: 0, quoteStatus: 'pending', status: 'under_evaluation' },
    { id: 'sp_haas', serialNumber: 'HAAS-40T-90233', model: 'Spindle 40-Taper 8100rpm', manufacturer: 'Haas', customer: CUSTOMERS.alfa.name, receivedDate: d(-1), quoteNumber: '', quotedValue: 0, quoteStatus: 'pending', status: 'received' },
    { id: 'sp_weiss', serialNumber: 'WS-170-11082', model: 'WS 170', manufacturer: 'Weiss', customer: CUSTOMERS.textil.name, receivedDate: d(-38), quoteNumber: 'COT-2610-022', quotedValue: 33700, quoteStatus: 'declined', status: 'declined' },
    { id: 'sp_weg50', serialNumber: 'WEG-2290017', model: 'W22 50cv 2P', manufacturer: 'WEG', customer: CUSTOMERS.hidrotec.name, receivedDate: d(-25), quoteNumber: 'COT-2611-004', quotedValue: 15800, quoteStatus: 'declined', status: 'declined' },
    // Histórico (meses anteriores) para gráfico Realizado vs. Forecast e ranking
    { id: 'sp_h1', serialNumber: 'FS-21533', model: 'MFW-1710', manufacturer: 'Fischer', customer: CUSTOMERS.usinagem.name, receivedDate: m(-5, -20), quoteNumber: 'COT-2605-011', quotedValue: 41200, quoteStatus: 'approved', status: 'delivered', deliveryDate: m(-5), invoicedValue: 41200 },
    { id: 'sp_h2', serialNumber: 'ST-49877', model: 'HSK-A63 Motor Spindle', manufacturer: 'Step-Tec', customer: CUSTOMERS.aeromec.name, receivedDate: m(-4, -25), quoteNumber: 'COT-2606-018', quotedValue: 58900, quoteStatus: 'approved', status: 'delivered', deliveryDate: m(-4), invoicedValue: 57500 },
    { id: 'sp_h3', serialNumber: 'WEG-1877412', model: 'W22 20cv 4P', manufacturer: 'WEG', customer: CUSTOMERS.metalforte.name, receivedDate: m(-4, -10), quoteNumber: 'COT-2606-024', quotedValue: 8400, quoteStatus: 'approved', status: 'delivered', deliveryDate: m(-4, 3), invoicedValue: 8400 },
    { id: 'sp_h4', serialNumber: 'KS-28811', model: 'DMS 100', manufacturer: 'Kessler', customer: CUSTOMERS.moldes.name, receivedDate: m(-3, -18), quoteNumber: 'COT-2607-007', quotedValue: 36400, quoteStatus: 'approved', status: 'delivered', deliveryDate: m(-3), invoicedValue: 36400 },
    { id: 'sp_h5', serialNumber: 'IB-8530', model: 'HF 80', manufacturer: 'IBAG', customer: CUSTOMERS.alfa.name, receivedDate: m(-2, -15), quoteNumber: 'COT-2608-013', quotedValue: 22300, quoteStatus: 'approved', status: 'delivered', deliveryDate: m(-2), invoicedValue: 22300 },
    { id: 'sp_h6', serialNumber: 'FS-22011', model: 'MFW-2310', manufacturer: 'Fischer', customer: CUSTOMERS.usinagem.name, receivedDate: m(-2, -20), quoteNumber: 'COT-2608-019', quotedValue: 47900, quoteStatus: 'approved', status: 'delivered', deliveryDate: m(-2, 5), invoicedValue: 47900 },
    { id: 'sp_h7', serialNumber: 'MZ-QTN-70011', model: 'QTN-200 Spindle', manufacturer: 'Mazak', customer: CUSTOMERS.autopecas.name, receivedDate: m(-1, -22), quoteNumber: 'COT-2609-028', quotedValue: 15600, quoteStatus: 'approved', status: 'delivered', deliveryDate: m(-1), invoicedValue: 15600 },
    { id: 'sp_h8', serialNumber: 'GMN-120-3902', model: 'HC 120', manufacturer: 'GMN', customer: CUSTOMERS.aeromec.name, receivedDate: m(-1, -30), quoteNumber: 'COT-2609-031', quotedValue: 44100, quoteStatus: 'approved', status: 'delivered', deliveryDate: m(-1, 4), invoicedValue: 44100 },
  ];

  // ───────────── Forecast ─────────────
  const forecast: ForecastItem[] = [
    { id: 'fc_1', customer: CUSTOMERS.aeromec.name, spindleModel: 'GMN HCS 170', description: 'Aprovação esperada da cotação COT-2611-029', estimatedValue: 54200, expectedDate: m(1, -5), probability: 80 },
    { id: 'fc_2', customer: CUSTOMERS.autopecas.name, spindleModel: 'Mazak QTN-250 (x3)', description: 'Revisão preventiva — contrato anual', estimatedValue: 50700, expectedDate: m(1), probability: 90 },
    { id: 'fc_3', customer: CUSTOMERS.usinagem.name, spindleModel: 'Fischer MFW-2310', description: 'Terceira unidade da linha 5 eixos (troca programada)', estimatedValue: 48500, expectedDate: m(2), probability: 60 },
    { id: 'fc_4', customer: CUSTOMERS.moldes.name, spindleModel: 'Fanuc αiI 12', description: 'Aguardando laudo de avaliação', estimatedValue: 18500, expectedDate: m(1, 10), probability: 50 },
    { id: 'fc_5', customer: CUSTOMERS.metalforte.name, spindleModel: 'WEG W22 75cv', description: 'Parada de manutenção de dezembro', estimatedValue: 21000, expectedDate: m(2, 8), probability: 40 },
    { id: 'fc_6', customer: CUSTOMERS.hidrotec.name, spindleModel: 'Siemens 1FT7 (x2)', description: 'Retrofit de servomotores da linha de bombas', estimatedValue: 29200, expectedDate: m(3), probability: 30 },
    { id: 'fc_7', customer: CUSTOMERS.alfa.name, spindleModel: 'Haas 40-Taper', description: 'Spindle recebido, aguardando avaliação', estimatedValue: 19800, expectedDate: m(0, 12), probability: 70 },
    { id: 'fc_8', customer: CUSTOMERS.textil.name, spindleModel: 'Weiss WS 170', description: 'Renegociação da cotação recusada', estimatedValue: 29900, expectedDate: m(4), probability: 20 },
  ];

  // ───────────── Projetos, alocações e férias ─────────────
  // wd(n) = n dias úteis a partir da segunda-feira desta semana (n pode ser negativo).
  const wd = (n: number) => addBusinessDays(week, n);
  const shop = { name: 'Oficina SpindleOps (bancada)', address: SHOP_ADDRESS };
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
    projectNumber: `PRJ-${today.slice(2, 4)}${today.slice(5, 7)}-${String(n).padStart(3, '0')}`,
    customer: customer.name,
    address: customer.address,
    serviceType,
    description,
    status: statusFor(span[0], span[1]),
    color,
    materials: [],
    ...extra,
  });

  const projects: Project[] = [
    prj(1, CUSTOMERS.usinagem, 'bench_repair', 'Reparo completo + instalação spindle Fischer MFW-2310 (S/N FS-22871)', '#2563eb', [wd(-3), wd(12)], {
      poId: 'po_4500918',
      spindleId: 'sp_fs22871',
      materials: [
        { id: 'mat_01', partNumber: 'SKF-7014CD/P4A', description: 'Rolamento de contato angular SKF 7014 CD/P4A (par)', quantity: 2, status: 'ordered', poId: 'po_skf33012', poLineId: 'pol_9', neededBy: wd(-1) },
        { id: 'mat_02', partNumber: 'SKF-7012ACD/HCP4A', description: 'Rolamento híbrido SKF 7012 ACD/HCP4A (par)', quantity: 1, status: 'ordered', poId: 'po_skf33012', poLineId: 'pol_10', neededBy: wd(1) },
        { id: 'mat_03', partNumber: 'KLU-ISOFLEX-NBU15', description: 'Graxa Klüber Isoflex NBU 15 (50g)', quantity: 4, status: 'ordered', poId: 'po_skf33012', poLineId: 'pol_11', neededBy: wd(2) },
        { id: 'mat_04', partNumber: 'FIS-RET-2310', description: 'Retentor labirinto dianteiro Fischer MFW-2310', quantity: 1, status: 'to_buy', neededBy: wd(3) },
      ],
    }),
    prj(2, CUSTOMERS.moldes, 'bench_repair', 'Reparo spindle IBAG HF 120 (S/N IB-8812) + teste de vibração', '#7c3aed', [wd(5), wd(15)], {
      poId: 'po_mmj0457',
      spindleId: 'sp_ib8812',
      materials: [
        { id: 'mat_05', partNumber: 'IBG-SEAL-KIT-HF120', description: 'Kit de vedação IBAG HF 120', quantity: 1, status: 'ordered', poId: 'po_cmp4471', poLineId: 'cmp_1', neededBy: wd(5) },
        { id: 'mat_06', partNumber: 'PT100-M8', description: 'Sensor de temperatura PT100 rosca M8', quantity: 2, status: 'to_buy', neededBy: wd(7) },
        { id: 'mat_12', partNumber: 'KLU-ISOFLEX-NBU15', description: 'Graxa Klüber Isoflex NBU 15 (50g)', quantity: 2, status: 'to_buy', neededBy: wd(6) },
      ],
    }),
    prj(3, CUSTOMERS.metalforte, 'site_visit', 'Inspeção de alinhamento — linha de prensas + coleta motor WEG', '#d97706', [wd(-6), wd(2)], {
      poId: 'po_mf2291',
      spindleId: 'sp_weg30',
      materials: [{ id: 'mat_07', partNumber: 'CU-ESM-1.2', description: 'Fio de cobre esmaltado 1,2 mm (kg)', quantity: 18, status: 'received' }],
    }),
    prj(4, CUSTOMERS.alfa, 'installation', 'Retrofit eletrospindle Kessler DMS 120 — diagnóstico, bancada e instalação', '#16a34a', [wd(0), wd(13)], {
      poId: 'po_alf1120',
      spindleId: 'sp_ks30419',
      materials: [
        { id: 'mat_08', partNumber: 'HEID-ERN1387', description: 'Encoder Heidenhain ERN 1387 2048 ppr', quantity: 1, status: 'ordered', poId: 'po_cmp4471', poLineId: 'cmp_2', neededBy: wd(10) },
        { id: 'mat_09', partNumber: 'CER-7010-P4', description: 'Rolamento cerâmico 7010 P4 (par)', quantity: 1, status: 'to_buy', neededBy: wd(10) },
        { id: 'mat_10', partNumber: 'HSK-A63-CAL', description: 'Barra de calibração HSK-A63', quantity: 1, status: 'received' },
        { id: 'mat_13', partNumber: 'PT100-M8', description: 'Sensor de temperatura PT100 rosca M8', quantity: 1, status: 'to_buy', neededBy: wd(10) },
      ],
    }),
    prj(5, CUSTOMERS.aeromec, 'site_visit', 'Levantamento técnico e pré-instalação spindle GMN HCS 170', '#db2777', [wd(-1), wd(5)], { spindleId: 'sp_gmn' }),
    prj(6, CUSTOMERS.autopecas, 'site_visit', 'Revisão preventiva tornos Mazak QTN-250 (3 spindles)', '#0891b2', [wd(0), wd(14)], {
      poId: 'po_avp8810',
      spindleId: 'sp_mz1',
      materials: [{ id: 'mat_11', partNumber: 'MAZ-REV-KIT', description: 'Kit revisão Mazak (rolamentos + vedações)', quantity: 3, status: 'to_buy', neededBy: wd(8) }],
    }),
    prj(7, CUSTOMERS.hidrotec, 'installation', 'Reinstalação servomotor Siemens 1FT7 + comissionamento', '#65a30d', [wd(-4), wd(-2)], { poId: 'po_hid5502', spindleId: 'sp_sie1ft7' }),
    prj(8, CUSTOMERS.hidrotec, 'site_visit', 'Proposta de retrofit dos servomotores da linha de bombas', '#ea580c', [wd(6), wd(7)]),
    prj(9, CUSTOMERS.textil, 'site_visit', 'Avaliação e renegociação Weiss WS 170', '#4f46e5', [wd(-15), wd(12)], { spindleId: 'sp_weiss' }),
    prj(10, shop, 'bench_repair', 'Manutenção da bancada de balanceamento', '#64748b', [wd(16), wd(17)]),
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
    // Carlos — campo (conflito proposital: prj_004 × prj_005 em wd(3))
    asg('prj_003', 'emp_carlos', wd(-6), wd(-4)),
    asg('prj_004', 'emp_carlos', wd(0), wd(3)),
    asg('prj_005', 'emp_carlos', wd(3), wd(5)),
    asg('prj_006', 'emp_carlos', wd(8), wd(14)),
    // Juliana — bancada
    asg('prj_001', 'emp_juliana', wd(-3), wd(4)),
    asg('prj_002', 'emp_juliana', wd(5), wd(9)),
    asg('prj_004', 'emp_juliana', wd(10), wd(13)),
    // Marcos — instalação (férias wd(1)..wd(10))
    asg('prj_007', 'emp_marcos', wd(-4), wd(-2)),
    asg('prj_001', 'emp_marcos', wd(11), wd(12)),
    asg('prj_002', 'emp_marcos', wd(14), wd(15)),
    // Patrícia — engenharia de aplicação
    asg('prj_005', 'emp_patricia', wd(-1), wd(1)),
    asg('prj_008', 'emp_patricia', wd(6), wd(7)),
    asg('prj_009', 'emp_patricia', wd(12), wd(12)),
    asg('prj_010', 'emp_patricia', wd(16), wd(17)),
    // Rafael — logística (coletas/entregas curtas)
    asg('prj_006', 'emp_rafael', wd(0), wd(0)),
    asg('prj_003', 'emp_rafael', wd(2), wd(2)),
    asg('prj_001', 'emp_rafael', wd(10), wd(10)),
    asg('prj_002', 'emp_rafael', wd(11), wd(11)),
    // Eduardo (inativo) — histórico
    asg('prj_009', 'emp_eduardo', wd(-15), wd(-12)),
  ];

  const absences: Absence[] = [
    { id: 'abs_1', employeeId: 'emp_marcos', type: 'vacation', startDate: wd(1), endDate: wd(10), note: 'Férias' },
    { id: 'abs_2', employeeId: 'emp_rafael', type: 'training', startDate: wd(15), endDate: wd(16), note: 'Treinamento NR-11' },
    { id: 'abs_3', employeeId: 'emp_juliana', type: 'vacation', startDate: wd(25), endDate: wd(34), note: 'Férias' },
  ];

  // ───────────── Fornecedores & catálogo de materiais ─────────────
  const suppliers: Supplier[] = [
    { id: 'sup_rp', name: 'Rolamentos Paulista Distribuidora', contactName: 'Marcelo Antunes', email: 'vendas@rolamentospaulista.com.br', phone: '(19) 3251-4400', notes: 'Pronta entrega de rolamentos de precisão.' },
    { id: 'sup_skf', name: 'SKF do Brasil', contactName: 'Renata Kobayashi', email: 'renata.k@skf-exemplo.com', phone: '(11) 4448-8000', notes: 'Compra direta; melhor preço, prazo longo.' },
    { id: 'sup_cip', name: 'Componentes Industriais Paulista', contactName: 'Diego Ferraz', email: 'diego@cip-exemplo.com.br', phone: '(11) 2091-3300', notes: '' },
    { id: 'sup_fis', name: 'Fischer Spindle Group', contactName: 'Thomas Weber', email: 'service@fischer-exemplo.ch', phone: '+41 32 000 0000', notes: 'Peças originais Fischer (importação).' },
    { id: 'sup_klu', name: 'Klüber Lubrication', contactName: 'Paula Rios', email: 'paula.rios@kluber-exemplo.com', phone: '(11) 4166-2200', notes: '' },
    { id: 'sup_sen', name: 'Sensortec Automação', contactName: 'Bruno Lima', email: 'comercial@sensortec-exemplo.com.br', phone: '(19) 3881-1200', notes: 'Sensores e encoders.' },
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
    { id: 'cm_01', partNumber: 'SKF-7014CD/P4A', description: 'Rolamento de contato angular SKF 7014 CD/P4A (par)', unit: 'par', offers: [q('sup_rp', 5, 2950), q('sup_skf', 25, 2780)] },
    { id: 'cm_02', partNumber: 'SKF-7012ACD/HCP4A', description: 'Rolamento híbrido SKF 7012 ACD/HCP4A (par)', unit: 'par', offers: [q('sup_rp', 7, 4380), q('sup_skf', 30, 4120)] },
    { id: 'cm_03', partNumber: 'KLU-ISOFLEX-NBU15', description: 'Graxa Klüber Isoflex NBU 15 (50g)', unit: 'un', offers: [q('sup_rp', 3, 189), q('sup_klu', 10, undefined, 'requested')] },
    { id: 'cm_04', partNumber: 'FIS-RET-2310', description: 'Retentor labirinto dianteiro Fischer MFW-2310', unit: 'un', offers: [q('sup_fis', 15, 2350), q('sup_cip', 10)] },
    { id: 'cm_05', partNumber: 'IBG-SEAL-KIT-HF120', description: 'Kit de vedação IBAG HF 120', unit: 'kit', offers: [q('sup_cip', 7, 1450)] },
    { id: 'cm_06', partNumber: 'PT100-M8', description: 'Sensor de temperatura PT100 rosca M8', unit: 'un', offers: [q('sup_sen', 4), q('sup_cip', 6)] },
    { id: 'cm_07', partNumber: 'HEID-ERN1387', description: 'Encoder Heidenhain ERN 1387 2048 ppr', unit: 'un', offers: [q('sup_cip', 10, 6890), q('sup_sen', 14, undefined, 'requested')] },
    { id: 'cm_08', partNumber: 'CER-7010-P4', description: 'Rolamento cerâmico 7010 P4 (par)', unit: 'par', offers: [q('sup_skf', 30, 3600), q('sup_rp', 8, undefined, 'requested')] },
    { id: 'cm_09', partNumber: 'MAZ-REV-KIT', description: 'Kit revisão Mazak (rolamentos + vedações)', unit: 'kit', offers: [q('sup_rp', 12, undefined, 'requested')] },
    { id: 'cm_10', partNumber: 'CU-ESM-1.2', description: 'Fio de cobre esmaltado 1,2 mm', unit: 'kg', offers: [q('sup_cip', 2, 98)] },
  ];

  return {
    employees: employees.map((e) => ({ ...e })),
    projects,
    assignments,
    absences,
    purchaseOrders,
    suppliers,
    materials,
    spindles,
    forecast,
  };
}
