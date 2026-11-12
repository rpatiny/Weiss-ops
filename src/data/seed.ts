/**
 * Dados de demonstração realistas (reparo de spindles e motores industriais).
 * Todas as datas são RELATIVAS ao dia em que o seed é gerado, para que a demo
 * sempre mostre atividades da semana, POs atrasadas, entregas do mês etc.
 */
import { addDays, addMonths, startOfWeek, todayISO } from '@/lib/dates';
import type {
  AppDatabase,
  CalendarActivity,
  Employee,
  ForecastItem,
  POLineItem,
  PurchaseOrder,
  SpindleUnit,
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
  const w = (n: number) => addDays(week, n); // 0 = segunda desta semana

  // ───────────── Purchase Orders ─────────────
  const purchaseOrders: PurchaseOrder[] = [
    {
      id: 'po_4500918', poNumber: '4500918', customerOrVendor: CUSTOMERS.usinagem.name, orderDate: d(-24),
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
      id: 'po_mf2291', poNumber: 'MF-2291', customerOrVendor: CUSTOMERS.metalforte.name, orderDate: d(-12),
      requester: 'Sandra Pires (Compras)', paymentTerms: '30/60 DDL', status: 'open',
      notes: 'Motor WEG W22 queimado — rebobinamento + troca de rolamentos.',
      attachments: [{ id: 'att_2', name: 'Pedido MF-2291.pdf', url: 'https://example.com/po/MF-2291.pdf', type: 'po_pdf' }],
      lines: [
        line('pol_4', 1, 'SRV-WEG-W22-RB', 'Rebobinamento motor WEG W22 30cv 4P', 1, 9800, d(5), 'open'),
        line('pol_5', 2, 'ROL-6312-2Z', 'Rolamento SKF 6312-2Z/C3', 2, 640, d(5), 'open'),
      ],
    },
    {
      id: 'po_aer7731', poNumber: 'AER-7731', customerOrVendor: CUSTOMERS.aeromec.name, orderDate: d(-40),
      requester: 'Eng. Ricardo Alves', paymentTerms: '45 DDL', status: 'invoiced',
      notes: 'Spindle Step-Tec HVC 140 — certificado de teste anexado à NF.',
      attachments: [
        { id: 'att_3', name: 'PO AER-7731.pdf', url: 'https://example.com/po/AER-7731.pdf', type: 'po_pdf' },
        { id: 'att_4', name: 'NF-e 18842.pdf', url: 'https://example.com/nf/18842.pdf', type: 'invoice' },
      ],
      lines: [line('pol_6', 1, 'SRV-STT-HVC140', 'Reparo spindle Step-Tec HVC 140 (S/N ST-51022)', 1, 62300, d(-15), 'delivered', d(-14))],
    },
    {
      id: 'po_mmj0457', poNumber: 'MMJ-0457', customerOrVendor: CUSTOMERS.moldes.name, orderDate: d(-18),
      requester: 'Luiz Fernando', paymentTerms: '28 DDL', status: 'open',
      notes: 'Spindle de alta rotação para fresamento de moldes. Cliente solicitou teste de vibração.',
      attachments: [],
      lines: [
        line('pol_7', 1, 'SRV-IBG-HF120', 'Reparo spindle IBAG HF 120 (S/N IB-8812)', 1, 27400, d(-2), 'open'),
        line('pol_8', 2, 'SRV-VIB-RPT', 'Relatório de análise de vibração', 1, 1200, d(-2), 'open'),
      ],
    },
    {
      id: 'po_skf33012', poNumber: 'SKF-33012', customerOrVendor: 'Rolamentos Paulista Distribuidora (Fornecedor)', orderDate: d(-9),
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
      id: 'po_alf1120', poNumber: 'ALF-1120', customerOrVendor: CUSTOMERS.alfa.name, orderDate: d(-6),
      requester: 'Marta Gonçalves', paymentTerms: 'À vista', status: 'open',
      notes: 'Retrofit de eletrospindle Kessler + instalação em campo.',
      attachments: [{ id: 'att_6', name: 'PO ALF-1120.pdf', url: 'https://example.com/po/ALF-1120.pdf', type: 'po_pdf' }],
      lines: [
        line('pol_12', 1, 'SRV-KES-DMS120', 'Reparo eletrospindle Kessler DMS 120 (S/N KS-30419)', 1, 39800, d(9), 'open'),
        line('pol_13', 2, 'SRV-INST-CAMPO', 'Instalação e alinhamento em campo (8h)', 1, 3200, d(11), 'open'),
      ],
    },
    {
      id: 'po_hid5502', poNumber: 'HID-5502', customerOrVendor: CUSTOMERS.hidrotec.name, orderDate: d(-55),
      requester: 'Paulo Cesar', paymentTerms: '28 DDL', status: 'delivered',
      notes: 'Servomotor Siemens 1FT7 — troca de encoder e rolamentos.',
      attachments: [{ id: 'att_7', name: 'PO HID-5502.pdf', url: 'https://example.com/po/HID-5502.pdf', type: 'po_pdf' }],
      lines: [line('pol_14', 1, 'SRV-SIE-1FT7', 'Reparo servomotor Siemens 1FT7086 + encoder', 1, 14600, d(-30), 'delivered', d(-28))],
    },
    {
      id: 'po_avp8810', poNumber: 'AVP-8810', customerOrVendor: CUSTOMERS.autopecas.name, orderDate: d(-3),
      requester: 'Eng. Camila Duarte', paymentTerms: '60 DDL', status: 'open',
      notes: '3 spindles de torno Mazak para revisão preventiva.',
      attachments: [],
      lines: [
        line('pol_15', 1, 'SRV-MAZ-PREV', 'Revisão preventiva spindle Mazak QTN-250', 3, 16900, d(20), 'open'),
        line('pol_16', 2, 'SRV-FRETE', 'Frete coleta/entrega dedicado', 2, 850, d(6), 'open'),
      ],
    },
    {
      id: 'po_tex0091', poNumber: 'TEX-0091', customerOrVendor: CUSTOMERS.textil.name, orderDate: d(-70),
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

  // ───────────── Atividades (semana passada → +2 semanas) ─────────────
  let n = 0;
  const act = (
    employeeId: string,
    date: string,
    startTime: string,
    endTime: string,
    routeOrder: number,
    serviceType: CalendarActivity['serviceType'],
    customer: { name: string; address: string },
    description: string,
    status: CalendarActivity['status'],
    links: { poId?: string; spindleId?: string } = {},
  ): CalendarActivity => ({
    id: `act_${String(++n).padStart(3, '0')}`,
    employeeId,
    date,
    startTime,
    endTime,
    routeOrder,
    serviceType,
    customer: customer.name,
    address: customer.address,
    description,
    status,
    ...links,
  });

  const shop = { name: 'Oficina SpindleOps (bancada)', address: SHOP_ADDRESS };
  const past = (offset: number) => (addDays(week, offset) < today ? 'completed' : 'planned') as CalendarActivity['status'];

  const activities: CalendarActivity[] = [
    // Semana passada
    act('emp_rafael', w(-7), '08:00', '10:00', 1, 'pickup', CUSTOMERS.moldes, 'Coleta spindle IBAG HF 120', 'completed', { spindleId: 'sp_ib8812', poId: 'po_mmj0457' }),
    act('emp_rafael', w(-7), '11:00', '12:30', 2, 'pickup', CUSTOMERS.metalforte, 'Coleta motor WEG W22 30cv', 'completed', { spindleId: 'sp_weg30', poId: 'po_mf2291' }),
    act('emp_carlos', w(-6), '09:00', '12:00', 1, 'site_visit', CUSTOMERS.alfa, 'Diagnóstico de ruído no eletrospindle Kessler', 'completed', { spindleId: 'sp_ks30419' }),
    act('emp_juliana', w(-5), '08:00', '17:00', 1, 'bench_repair', shop, 'Desmontagem e inspeção IBAG HF 120', 'completed', { spindleId: 'sp_ib8812' }),
    act('emp_patricia', w(-4), '14:00', '16:00', 1, 'site_visit', CUSTOMERS.aeromec, 'Reunião técnica — cotação GMN HCS 170', 'completed', { spindleId: 'sp_gmn' }),
    act('emp_eduardo', w(-4), '08:00', '12:00', 1, 'site_visit', CUSTOMERS.textil, 'Avaliação Weiss WS 170 (último atendimento)', 'completed', { spindleId: 'sp_weiss' }),

    // Semana atual
    act('emp_rafael', w(0), '07:30', '09:00', 1, 'pickup', CUSTOMERS.autopecas, 'Coleta 3 spindles Mazak QTN-250', past(0), { poId: 'po_avp8810', spindleId: 'sp_mz1' }),
    act('emp_rafael', w(0), '10:30', '12:00', 2, 'delivery', CUSTOMERS.aeromec, 'Entrega documentação / certificado de teste', past(0), { poId: 'po_aer7731' }),
    act('emp_rafael', w(0), '14:00', '15:30', 3, 'pickup', CUSTOMERS.hidrotec, 'Retirada de caixas de transporte vazias', past(0)),
    act('emp_juliana', w(0), '08:00', '17:00', 1, 'bench_repair', shop, 'Troca de rolamentos Fischer MFW-2310 FS-22871', past(0), { spindleId: 'sp_fs22871', poId: 'po_4500918' }),
    act('emp_carlos', w(1), '08:00', '11:00', 1, 'site_visit', CUSTOMERS.usinagem, 'Análise de vibração em máquina 5 eixos', past(1), { poId: 'po_4500918' }),
    act('emp_carlos', w(1), '13:30', '16:00', 2, 'site_visit', CUSTOMERS.textil, 'Prospecção — renegociação Weiss WS 170', past(1)),
    act('emp_marcos', w(1), '08:00', '12:00', 1, 'installation', CUSTOMERS.hidrotec, 'Reinstalação servomotor Siemens 1FT7', past(1), { spindleId: 'sp_sie1ft7', poId: 'po_hid5502' }),
    act('emp_juliana', w(2), '08:00', '12:00', 1, 'bench_repair', shop, 'Balanceamento IBAG HF 120', past(2), { spindleId: 'sp_ib8812' }),
    act('emp_juliana', w(2), '13:00', '17:00', 2, 'bench_repair', shop, 'Rebobinamento WEG W22 — montagem', past(2), { spindleId: 'sp_weg30' }),
    act('emp_patricia', w(2), '09:00', '11:00', 1, 'site_visit', CUSTOMERS.moldes, 'Apresentação laudo Fanuc αiI 12', past(2), { spindleId: 'sp_fanuc' }),
    act('emp_patricia', w(2), '14:00', '16:00', 2, 'site_visit', CUSTOMERS.aeromec, 'Follow-up cotação COT-2611-029', past(2), { spindleId: 'sp_gmn' }),
    // Conflito proposital (Carlos, mesmo dia, horários sobrepostos)
    act('emp_carlos', w(3), '08:30', '11:30', 1, 'site_visit', CUSTOMERS.metalforte, 'Inspeção de alinhamento — linha de prensas', past(3)),
    act('emp_carlos', w(3), '11:00', '13:00', 2, 'site_visit', CUSTOMERS.moldes, 'Visita técnica — centro de usinagem Romi', past(3)),
    act('emp_carlos', w(3), '15:00', '17:00', 3, 'delivery', CUSTOMERS.alfa, 'Entrega de laudo técnico Kessler', past(3), { spindleId: 'sp_ks30419' }),
    act('emp_rafael', w(3), '08:00', '09:30', 1, 'pickup', CUSTOMERS.alfa, 'Coleta spindle Haas 40-Taper', past(3), { spindleId: 'sp_haas' }),
    act('emp_rafael', w(3), '10:30', '12:00', 2, 'delivery', CUSTOMERS.usinagem, 'Entrega rolamentos sobressalentes', past(3), { poId: 'po_4500918' }),
    act('emp_marcos', w(4), '08:00', '17:00', 1, 'installation', CUSTOMERS.usinagem, 'Instalação Fischer MFW-2310 FS-22904 + run-in', past(4), { spindleId: 'sp_fs22904', poId: 'po_4500918' }),
    act('emp_juliana', w(4), '08:00', '16:00', 1, 'bench_repair', shop, 'Teste em bancada Fischer FS-22871 (run-in 6h)', past(4), { spindleId: 'sp_fs22871' }),

    // Próxima semana
    act('emp_rafael', w(7), '07:30', '09:00', 1, 'delivery', CUSTOMERS.metalforte, 'Entrega motor WEG W22 30cv reparado', 'planned', { spindleId: 'sp_weg30', poId: 'po_mf2291' }),
    act('emp_rafael', w(7), '10:00', '11:30', 2, 'delivery', CUSTOMERS.moldes, 'Entrega spindle IBAG HF 120', 'planned', { spindleId: 'sp_ib8812', poId: 'po_mmj0457' }),
    act('emp_rafael', w(7), '13:30', '15:00', 3, 'pickup', CUSTOMERS.aeromec, 'Coleta spindle GMN HCS 170', 'planned', { spindleId: 'sp_gmn' }),
    act('emp_marcos', w(8), '08:00', '12:00', 1, 'installation', CUSTOMERS.moldes, 'Instalação IBAG HF 120 + teste de vibração', 'planned', { spindleId: 'sp_ib8812', poId: 'po_mmj0457' }),
    act('emp_carlos', w(8), '08:00', '10:00', 1, 'site_visit', CUSTOMERS.autopecas, 'Levantamento técnico tornos Mazak', 'planned', { poId: 'po_avp8810' }),
    act('emp_carlos', w(8), '13:00', '15:00', 2, 'site_visit', CUSTOMERS.aeromec, 'Inspeção de máquina — pré-instalação GMN', 'planned', { spindleId: 'sp_gmn' }),
    act('emp_juliana', w(9), '08:00', '17:00', 1, 'bench_repair', shop, 'Desmontagem Kessler DMS 120', 'planned', { spindleId: 'sp_ks30419', poId: 'po_alf1120' }),
    act('emp_patricia', w(9), '10:00', '12:00', 1, 'site_visit', CUSTOMERS.hidrotec, 'Proposta retrofit servomotores', 'planned'),
    act('emp_rafael', w(10), '08:00', '09:30', 1, 'delivery', CUSTOMERS.usinagem, 'Entrega Fischer MFW-2310 FS-22871', 'planned', { spindleId: 'sp_fs22871', poId: 'po_4500918' }),
    act('emp_marcos', w(10), '10:00', '17:00', 1, 'installation', CUSTOMERS.usinagem, 'Instalação Fischer FS-22871', 'planned', { spindleId: 'sp_fs22871', poId: 'po_4500918' }),
    act('emp_juliana', w(14), '08:00', '17:00', 1, 'bench_repair', shop, 'Montagem Kessler DMS 120', 'planned', { spindleId: 'sp_ks30419' }),
    act('emp_marcos', w(16), '08:00', '16:00', 1, 'installation', CUSTOMERS.alfa, 'Instalação e alinhamento Kessler DMS 120', 'planned', { spindleId: 'sp_ks30419', poId: 'po_alf1120' }),
    act('emp_carlos', w(17), '09:00', '12:00', 1, 'site_visit', CUSTOMERS.metalforte, 'Visita preventiva trimestral', 'planned'),
  ];

  return {
    employees: employees.map((e) => ({ ...e })),
    activities,
    purchaseOrders,
    spindles,
    forecast,
  };
}
