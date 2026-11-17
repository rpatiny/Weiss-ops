import { Camera } from 'lucide-react';
import { PageHeader } from '@/components/ui/misc';
import { useI18n } from '@/i18n';
import { ShopfloorTab } from './ShopfloorTab';

/** Pedidos do shop floor (item próprio no menu, seção Compras). */
export function ShopfloorPage() {
  const { t } = useI18n();
  return (
    <>
      <PageHeader icon={Camera} title={t('shopfloor.pageTitle')} description={t('shopfloor.pageDescription')} />
      <ShopfloorTab />
    </>
  );
}
