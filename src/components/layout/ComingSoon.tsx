import { Hammer, type LucideIcon } from 'lucide-react';
import { EmptyState, PageHeader } from '@/components/ui/misc';
import { useI18n } from '@/i18n';

export function ComingSoon({ title, description, icon, phase }: { title: string; description: string; icon: LucideIcon; phase: number }) {
  const { t } = useI18n();
  return (
    <>
      <PageHeader title={title} description={description} icon={icon} />
      <div className="card">
        <EmptyState icon={Hammer} title={t('comingSoon.title', { phase })} description={t('comingSoon.description')} />
      </div>
    </>
  );
}
