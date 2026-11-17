import { Building2, Camera, CalendarRange, ClipboardList, Database, FolderKanban, Globe2, LineChart, Timer, Users, type LucideIcon } from 'lucide-react';
import type { RoutePath } from '@/app/router';
import type { TranslationKey } from '@/i18n/types';
import type { UserRole } from '@/types/models';

export interface NavItem {
  path: RoutePath;
  labelKey: TranslationKey;
  icon: LucideIcon;
}

export interface NavSection {
  id: 'operations' | 'purchasing' | 'finance';
  labelKey: TranslationKey;
  items: NavItem[];
}

const OPERATIONS: NavSection = {
  id: 'operations',
  labelKey: 'app.section.operations',
  items: [
    { path: '/calendar', labelKey: 'app.nav.calendar', icon: CalendarRange },
    { path: '/projects', labelKey: 'app.nav.projects', icon: FolderKanban },
    { path: '/timesheet', labelKey: 'app.nav.timesheet', icon: Timer },
  ],
};

const PURCHASING: NavSection = {
  id: 'purchasing',
  labelKey: 'app.section.purchasing',
  items: [
    { path: '/purchase-orders', labelKey: 'app.nav.purchaseOrders', icon: ClipboardList },
    { path: '/shopfloor', labelKey: 'app.nav.shopfloor', icon: Camera },
    { path: '/extensions', labelKey: 'app.nav.extensions', icon: Globe2 },
  ],
};

const FINANCE: NavSection = {
  id: 'finance',
  labelKey: 'app.section.finance',
  items: [{ path: '/financial', labelKey: 'app.nav.financial', icon: LineChart }],
};

/**
 * Menu por prioridade de cada perfil: a Logística trabalha em Compras (vem primeiro e é a tela inicial);
 * Office e Master começam pela Operação (cronograma, projetos, horas). Financeiro por último (consulta mensal).
 */
export function navSections(role: UserRole | undefined): NavSection[] {
  return role === 'logistics' ? [PURCHASING, OPERATIONS, FINANCE] : [OPERATIONS, PURCHASING, FINANCE];
}

/** Tela inicial depois do login. */
export const homeRoute = (role: UserRole | undefined): RoutePath => (role === 'logistics' ? '/purchase-orders' : '/calendar');

/** Todas as páginas do menu principal (ex.: "quem está online" mostra o nome da página). */
export const NAV_ITEMS: NavItem[] = [OPERATIONS, PURCHASING, FINANCE].flatMap((s) => s.items);

/** Rodapé da barra lateral: cadastros e manutenção (junto do tema escuro). */
export const NAV_FOOTER: NavItem[] = [
  { path: '/employees', labelKey: 'app.nav.employees', icon: Users },
  { path: '/customers', labelKey: 'app.nav.customers', icon: Building2 },
  { path: '/settings', labelKey: 'app.nav.settings', icon: Database },
];
