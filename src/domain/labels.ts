import type {
  AbsenceType,
  AttachmentType,
  EmployeeStatus,
  POLineStatus,
  MaterialStatus,
  POStatus,
  ProjectStatus,
  QuoteStatus,
  ServiceType,
  SpindleStatus,
} from '@/types/models';
import type { TFunction, TranslationKey } from '@/i18n/types';

/** Tons visuais usados pelo componente <Badge>. */
export type Tone = 'slate' | 'blue' | 'amber' | 'green' | 'red' | 'violet' | 'cyan' | 'orange';

/** Mapeia cada enum do domínio para seus valores (os rótulos ficam em `i18n/*.ts` → `enums.<kind>.<value>`). */
export interface EnumValues {
  employeeStatus: EmployeeStatus;
  serviceType: ServiceType;
  projectStatus: ProjectStatus;
  materialStatus: MaterialStatus;
  absenceType: AbsenceType;
  poStatus: POStatus;
  poLineStatus: POLineStatus;
  attachmentType: AttachmentType;
  quoteStatus: QuoteStatus;
  spindleStatus: SpindleStatus;
}
export type EnumKind = keyof EnumValues;

export const ENUM_TONES: { [K in EnumKind]: Record<EnumValues[K], Tone> } = {
  employeeStatus: { active: 'green', inactive: 'slate' },
  serviceType: { site_visit: 'blue', pickup: 'amber', delivery: 'green', bench_repair: 'violet', installation: 'cyan' },
  projectStatus: { planned: 'slate', in_progress: 'blue', completed: 'green', canceled: 'red' },
  materialStatus: { to_buy: 'red', ordered: 'amber', received: 'green' },
  absenceType: { vacation: 'cyan', leave: 'slate', training: 'violet' },
  poStatus: { open: 'blue', partial: 'amber', delivered: 'green', invoiced: 'violet', canceled: 'red' },
  poLineStatus: { open: 'blue', partial: 'amber', delivered: 'green', canceled: 'red' },
  attachmentType: { po_pdf: 'blue', invoice: 'green', other: 'slate' },
  quoteStatus: { pending: 'slate', sent: 'blue', approved: 'green', declined: 'red' },
  spindleStatus: {
    received: 'slate',
    under_evaluation: 'cyan',
    quoted: 'blue',
    approved: 'violet',
    in_repair: 'amber',
    testing: 'orange',
    delivered: 'green',
    declined: 'red',
  },
};

export function enumLabel<K extends EnumKind>(t: TFunction, kind: K, value: EnumValues[K]): string {
  return t(`enums.${kind}.${value}` as TranslationKey);
}

export function enumValues<K extends EnumKind>(kind: K): EnumValues[K][] {
  return Object.keys(ENUM_TONES[kind]) as EnumValues[K][];
}

/** Opções de <Select> traduzidas para um enum. */
export function enumOptions<K extends EnumKind>(t: TFunction, kind: K): { value: EnumValues[K]; label: string }[] {
  return enumValues(kind).map((value) => ({ value, label: enumLabel(t, kind, value) }));
}

/** Paleta sugerida para colaboradores (seletor de cor). */
export const EMPLOYEE_COLORS = [
  '#2563eb', '#dc2626', '#16a34a', '#d97706', '#7c3aed', '#0891b2',
  '#db2777', '#65a30d', '#ea580c', '#4f46e5', '#0d9488', '#9333ea',
];
