import { createContext, useContext } from 'react';
import { Factory, PackageOpen, Settings2, Truck, Wrench, type LucideIcon } from 'lucide-react';
import type { CalendarActivity, Employee, PurchaseOrder, ServiceType, SpindleUnit } from '@/types/models';

export const SERVICE_ICONS: Record<ServiceType, LucideIcon> = {
  site_visit: Factory,
  pickup: PackageOpen,
  delivery: Truck,
  bench_repair: Wrench,
  installation: Settings2,
};

/** Dados e callbacks compartilhados pelas visões do calendário (evita prop drilling). */
export interface CalendarCtx {
  employeesById: Map<string, Employee>;
  activitiesById: Map<string, CalendarActivity>;
  poById: Map<string, PurchaseOrder>;
  spindleById: Map<string, SpindleUnit>;
  conflicts: Map<string, string[]>;
  today: string;
  onOpenActivity: (a: CalendarActivity) => void;
  onCreate: (date: string, employeeId?: string) => void;
  onOpenRoute: (date: string, employeeId?: string) => void;
  onFocusDate: (date: string) => void;
}

export const CalendarContext = createContext<CalendarCtx | null>(null);

export function useCalendarCtx(): CalendarCtx {
  const ctx = useContext(CalendarContext);
  if (!ctx) throw new Error('useCalendarCtx fora de <CalendarContext.Provider>');
  return ctx;
}

/** Hex `#rrggbb` + alpha (0–1) → `#rrggbbaa`. */
export function withAlpha(hex: string, alpha: number): string {
  const a = Math.round(Math.min(1, Math.max(0, alpha)) * 255)
    .toString(16)
    .padStart(2, '0');
  return `${hex}${a}`;
}
