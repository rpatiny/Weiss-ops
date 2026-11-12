import type {
  ActivityStatus,
  AttachmentType,
  EmployeeStatus,
  POLineStatus,
  POStatus,
  QuoteStatus,
  ServiceType,
  SpindleStatus,
} from '@/types/models';

/** Tons visuais usados pelo componente <Badge>. */
export type Tone = 'slate' | 'blue' | 'amber' | 'green' | 'red' | 'violet' | 'cyan' | 'orange';

export interface Meta {
  label: string;
  tone: Tone;
}

export const EMPLOYEE_STATUS: Record<EmployeeStatus, Meta> = {
  active: { label: 'Ativo', tone: 'green' },
  inactive: { label: 'Inativo', tone: 'slate' },
};

export const SERVICE_TYPE: Record<ServiceType, Meta> = {
  site_visit: { label: 'Visita técnica', tone: 'blue' },
  pickup: { label: 'Coleta', tone: 'amber' },
  delivery: { label: 'Entrega', tone: 'green' },
  bench_repair: { label: 'Reparo em bancada', tone: 'violet' },
  installation: { label: 'Instalação', tone: 'cyan' },
};

export const ACTIVITY_STATUS: Record<ActivityStatus, Meta> = {
  planned: { label: 'Planejada', tone: 'slate' },
  in_progress: { label: 'Em andamento', tone: 'blue' },
  completed: { label: 'Concluída', tone: 'green' },
  canceled: { label: 'Cancelada', tone: 'red' },
};

export const PO_STATUS: Record<POStatus, Meta> = {
  open: { label: 'Aberta', tone: 'blue' },
  partial: { label: 'Parcial', tone: 'amber' },
  delivered: { label: 'Entregue', tone: 'green' },
  invoiced: { label: 'Faturada', tone: 'violet' },
  canceled: { label: 'Cancelada', tone: 'red' },
};

export const PO_LINE_STATUS: Record<POLineStatus, Meta> = {
  open: { label: 'Aberta', tone: 'blue' },
  partial: { label: 'Parcial', tone: 'amber' },
  delivered: { label: 'Entregue', tone: 'green' },
  canceled: { label: 'Cancelada', tone: 'red' },
};

export const ATTACHMENT_TYPE: Record<AttachmentType, Meta> = {
  po_pdf: { label: 'PDF da PO', tone: 'blue' },
  invoice: { label: 'Invoice / Fatura', tone: 'green' },
  other: { label: 'Outro', tone: 'slate' },
};

export const QUOTE_STATUS: Record<QuoteStatus, Meta> = {
  pending: { label: 'Pendente', tone: 'slate' },
  sent: { label: 'Enviada', tone: 'blue' },
  approved: { label: 'Aprovada', tone: 'green' },
  declined: { label: 'Recusada', tone: 'red' },
};

export const SPINDLE_STATUS: Record<SpindleStatus, Meta> = {
  received: { label: 'Recebido', tone: 'slate' },
  under_evaluation: { label: 'Em avaliação', tone: 'cyan' },
  quoted: { label: 'Cotado', tone: 'blue' },
  approved: { label: 'Aprovado', tone: 'violet' },
  in_repair: { label: 'Em reparo', tone: 'amber' },
  testing: { label: 'Em teste', tone: 'orange' },
  delivered: { label: 'Entregue', tone: 'green' },
  declined: { label: 'Recusado', tone: 'red' },
};

/** Utilitário para montar <option>s a partir de um mapa de metadados. */
export function optionsOf<K extends string>(map: Record<K, Meta>): { value: K; label: string }[] {
  return (Object.keys(map) as K[]).map((value) => ({ value, label: map[value].label }));
}

/** Paleta sugerida para colaboradores (seletor de cor). */
export const EMPLOYEE_COLORS = [
  '#2563eb', '#dc2626', '#16a34a', '#d97706', '#7c3aed', '#0891b2',
  '#db2777', '#65a30d', '#ea580c', '#4f46e5', '#0d9488', '#9333ea',
];
