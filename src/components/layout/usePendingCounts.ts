import { useMemo } from 'react';
import { useCurrentUser } from '@/app/session';
import { useCollection } from '@/data/hooks';
import { unseenExtensionDone, unseenExtensionRejected } from '@/domain/extensions';
import { effectiveStatus, needsLogistics, openQty, requisitionItemViews, unseenPOEvents, unseenRejection } from '@/domain/requisitions';

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

/** Pedidos do shop floor sem ação (para quem processa: logística e master). */
export function usePendingShopfloor(): number {
  const user = useCurrentUser();
  const list = useCollection('shopfloorRequests');
  return useMemo(() => (!user || user.role === 'office' ? 0 : list.filter((r) => r.status === 'new').length), [user, list]);
}

/** Atualizações para o cliente aguardando revisão do Office (badge em Projects). */
export function usePendingCustomerUpdates(): number {
  const user = useCurrentUser();
  const list = useCollection('projectUpdates');
  return useMemo(() => (!user || user.role === 'logistics' ? 0 : list.filter((u) => u.status === 'pending').length), [user, list]);
}

/** Pedidos de extensão em aberto (para quem executa: logística e master). */
export function usePendingExtensions(): number {
  const user = useCurrentUser();
  const extensions = useCollection('extensions');
  return useMemo(() => (!user || user.role === 'office' ? 0 : extensions.filter((x) => x.status === 'requested' || x.status === 'in_progress').length), [user, extensions]);
}

/** Novidades para quem pediu (número verde): requisições minhas com PO registrada que ainda não abri. */
export function useRequesterUpdates(): number {
  const user = useCurrentUser();
  const requisitions = useCollection('requisitions');
  return useMemo(() => (user ? requisitions.filter((r) => r.requestedBy === user.id && unseenPOEvents(r).length > 0).length : 0), [user, requisitions]);
}

/** Extensões que eu pedi e foram concluídas, ainda não vistas (número verde em Extensões). */
export function useRequesterExtensionUpdates(): number {
  const user = useCurrentUser();
  const extensions = useCollection('extensions');
  return useMemo(() => (user ? extensions.filter((x) => x.requestedBy === user.id && unseenExtensionDone(x)).length : 0), [user, extensions]);
}

/** Pedidos meus recusados e ainda não vistos (número amarelo): requisições e extensões. */
export function useRequesterRejections(): { requisitions: number; extensions: number } {
  const user = useCurrentUser();
  const requisitions = useCollection('requisitions');
  const extensions = useCollection('extensions');
  return useMemo(
    () =>
      user
        ? {
            requisitions: requisitions.filter((r) => r.requestedBy === user.id && unseenRejection(r)).length,
            extensions: extensions.filter((x) => x.requestedBy === user.id && unseenExtensionRejected(x)).length,
          }
        : { requisitions: 0, extensions: 0 },
    [user, requisitions, extensions],
  );
}
