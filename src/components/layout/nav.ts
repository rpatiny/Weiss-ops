import { CalendarRange, ClipboardList, Database, FolderKanban, Globe2, LineChart, Users, type LucideIcon } from 'lucide-react';
import type { RoutePath } from '@/app/router';
import type { TranslationKey } from '@/i18n/types';

export interface NavItem {
  path: RoutePath;
  labelKey: TranslationKey;
  icon: LucideIcon;
}

export const NAV_ITEMS: NavItem[] = [
  { path: '/calendar', labelKey: 'app.nav.calendar', icon: CalendarRange },
  { path: '/projects', labelKey: 'app.nav.projects', icon: FolderKanban },
  { path: '/purchase-orders', labelKey: 'app.nav.purchaseOrders', icon: ClipboardList },
  { path: '/extensions', labelKey: 'app.nav.extensions', icon: Globe2 },
  { path: '/financial', labelKey: 'app.nav.financial', icon: LineChart },
];

/** Rodapé da barra lateral: cadastros e manutenção (junto do tema escuro). */
export const NAV_FOOTER: NavItem[] = [
  { path: '/employees', labelKey: 'app.nav.employees', icon: Users },
  { path: '/settings', labelKey: 'app.nav.settings', icon: Database },
];
