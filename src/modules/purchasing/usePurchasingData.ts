import { useMemo } from 'react';
import { useCollection } from '@/data/hooks';
import { demandByPartNumber, normPN, projectReadiness, projectStarts } from '@/domain/purchasing';
import { todayISO } from '@/lib/dates';
import type { Project } from '@/types/models';

/** Lookups de compras memoizados, compartilhados por Compras e pelo Cronograma. */
export function usePurchasingData() {
  const purchaseOrders = useCollection('purchaseOrders');
  const suppliers = useCollection('suppliers');
  const catalog = useCollection('materials');
  const projects = useCollection('projects');
  const assignments = useCollection('assignments');
  const today = todayISO();

  return useMemo(() => {
    const poById = new Map(purchaseOrders.map((p) => [p.id, p]));
    const suppliersById = new Map(suppliers.map((s) => [s.id, s]));
    const catalogByPN = new Map(catalog.map((c) => [normPN(c.partNumber), c]));
    const starts = projectStarts(assignments);
    const demand = demandByPartNumber(projects, starts, poById, today);
    const readinessOf = (p: Project) => projectReadiness(p, starts.get(p.id), poById, catalogByPN, suppliersById, purchaseOrders, demand, today);
    return { purchaseOrders, suppliers, catalog, projects, poById, suppliersById, catalogByPN, starts, demand, readinessOf, today };
  }, [purchaseOrders, suppliers, catalog, projects, assignments, today]);
}
