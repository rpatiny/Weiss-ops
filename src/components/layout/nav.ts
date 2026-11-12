import { CalendarRange, ClipboardList, Database, LineChart, Users, type LucideIcon } from 'lucide-react';
import type { RoutePath } from '@/app/router';

export interface NavItem {
  path: RoutePath;
  label: string;
  description: string;
  icon: LucideIcon;
}

export const NAV_ITEMS: NavItem[] = [
  { path: '/calendar', label: 'Agenda & Rotas', description: 'Calendário de trabalho e roteirização', icon: CalendarRange },
  { path: '/purchase-orders', label: 'Ordens de Compra', description: 'POs, itens e entregas', icon: ClipboardList },
  { path: '/financial', label: 'Hub Financeiro', description: 'Spindles, cotações e forecast', icon: LineChart },
  { path: '/employees', label: 'Colaboradores', description: 'Equipe técnica e logística', icon: Users },
];

export const NAV_FOOTER: NavItem[] = [
  { path: '/settings', label: 'Dados & Backup', description: 'Exportação, backup e reset', icon: Database },
];
