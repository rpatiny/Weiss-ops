import { useMemo } from 'react';
import { useCurrentUser } from '@/app/session';
import { useCollection } from '@/data/hooks';
import { effectiveStatus, needsLogistics, openQty, requisitionItemViews } from '@/domain/requisitions';

/** Pendências do perfil atual (badge no menu): logística = requisições + linhas sem GR. */
export function usePendingCounts(): number {
  const user = useCurrentUser();
  const requisitions = useCollection('requisitions');
  const projects = useCollection('projects');
  const pos = useCollection('purchaseOrders');
  return useMemo(() => {
    if (!user || user.role === 'office') return 0;
    const poById = new Map(pos.map((p) => [p.id, p]));
    const prPending = requisitions.filter((r) => needsLogistics(effectiveStatus(r, requisitionItemViews(r, projects.find((p) => p.id === r.projectId), poById)))).length;
    const today = new Date().toISOString().slice(0, 10);
    const lateLines = pos
      .filter((p) => p.kind === 'purchase' && p.status !== 'canceled')
      .flatMap((p) => p.lines)
      .filter((l) => l.status !== 'canceled' && openQty(l) > 0 && l.expectedDeliveryDate <= today).length;
    return prPending + lateLines;
  }, [user, requisitions, projects, pos]);
}

/** Pedidos de extensão em aberto (para quem executa: logística e master). */
export function usePendingExtensions(): number {
  const user = useCurrentUser();
  const extensions = useCollection('extensions');
  return useMemo(() => (!user || user.role === 'office' ? 0 : extensions.filter((x) => x.status === 'requested' || x.status === 'in_progress').length), [user, extensions]);
}
