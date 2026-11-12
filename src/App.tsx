import { ClipboardList, LineChart } from 'lucide-react';
import { Layout } from '@/components/layout/Layout';
import { ComingSoon } from '@/components/layout/ComingSoon';
import { useRoute, type RoutePath } from '@/app/router';
import { useI18n } from '@/i18n';
import { SchedulePage } from '@/modules/calendar/SchedulePage';
import { EmployeesPage } from '@/modules/employees/EmployeesPage';
import { SettingsPage } from '@/modules/settings/SettingsPage';

function Page({ path }: { path: RoutePath }) {
  const { t } = useI18n();
  switch (path) {
    case '/employees':
      return <EmployeesPage />;
    case '/settings':
      return <SettingsPage />;
    case '/calendar':
      return <SchedulePage />;
    case '/purchase-orders':
      return <ComingSoon phase={3} icon={ClipboardList} title={t('app.nav.purchaseOrders')} description={t('comingSoon.poDescription')} />;
    case '/financial':
      return <ComingSoon phase={4} icon={LineChart} title={t('app.nav.financial')} description={t('comingSoon.financialDescription')} />;
  }
}

export default function App() {
  const { path } = useRoute();
  return (
    <Layout>
      <Page key={path} path={path} />
    </Layout>
  );
}
