import type { Project } from '@/types/models';
import { RequisitionWizardDrawer } from './RequisitionWizardDrawer';

/**
 * Pedido de compra a partir da aba Materiais do projeto: o mesmo formulário da tela de Compras, já com o projeto e os
 * materiais selecionados (fornecedor obrigatório por item).
 */
export function NewRequisitionDrawer({ open, project, materialIds, onClose, onCreated }: { open: boolean; project: Project; materialIds: string[]; projectStart?: string; onClose: () => void; onCreated: () => void }) {
  return <RequisitionWizardDrawer open={open} initialProjectId={project.id} initialSelected={materialIds} onClose={onClose} onCreated={() => onCreated()} />;
}
