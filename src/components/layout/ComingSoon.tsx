import { Hammer, type LucideIcon } from 'lucide-react';
import { EmptyState, PageHeader } from '@/components/ui/misc';

export function ComingSoon({ title, description, icon, phase }: { title: string; description: string; icon: LucideIcon; phase: number }) {
  return (
    <>
      <PageHeader title={title} description={description} icon={icon} />
      <div className="card">
        <EmptyState icon={Hammer} title={`Módulo em construção — Fase ${phase}`} description="Os dados de demonstração deste módulo já estão carregados na camada de persistência." />
      </div>
    </>
  );
}
