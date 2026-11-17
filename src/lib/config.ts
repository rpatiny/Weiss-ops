/** Configuração regional da aplicação. Altere aqui para trocar moeda/locale. */
/** Cargo padrão: todos os técnicos das rotas são engenheiros (pré-preenchido ao cadastrar; editável). */
export const DEFAULT_EMPLOYEE_ROLE = 'Engineer';

export const APP_CONFIG = {
  appName: 'SpindleOps',
  companyTagline: 'Spindle & Motor Repair',
  locale: 'en-GB',
  currency: 'GBP',
  storagePrefix: 'spindleops',
  schemaVersion: 5,
} as const;

/** Endereço da base/oficina (ponto de partida opcional das rotas). */
export const BASE_ADDRESS = 'Weiss UK workshop';

/**
 * Plantas/centros do SAP. `HOME_PLANT` é a planta que compra (os materiais precisam estar
 * estendidos para ela antes da PO). Ajuste os códigos conforme o SAP da empresa.
 */
export const HOME_PLANT = 'UK01';
export const SAP_PLANTS = [
  { code: 'UK01', label: 'United Kingdom' },
  { code: 'DE01', label: 'Germany' },
  { code: 'BR01', label: 'Brazil' },
];
