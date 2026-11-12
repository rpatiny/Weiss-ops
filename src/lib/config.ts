/** Configuração regional da aplicação. Altere aqui para trocar moeda/locale. */
export const APP_CONFIG = {
  appName: 'SpindleOps',
  companyTagline: 'Reparo de Spindles & Motores',
  locale: 'pt-BR',
  currency: 'BRL',
  storagePrefix: 'spindleops',
  schemaVersion: 5,
} as const;

/** Endereço da base/oficina (ponto de partida opcional das rotas). */
export const BASE_ADDRESS = 'Rua Hermínio Rodrigues, 200 - Distrito Industrial, Valinhos - SP';

/**
 * Plantas/centros do SAP. `HOME_PLANT` é a planta que compra (os materiais precisam estar
 * estendidos para ela antes da PO). Ajuste os códigos conforme o SAP da empresa.
 */
export const HOME_PLANT = 'UK01';
export const SAP_PLANTS = [
  { code: 'UK01', label: 'Reino Unido' },
  { code: 'DE01', label: 'Alemanha' },
  { code: 'BR01', label: 'Brasil' },
];
