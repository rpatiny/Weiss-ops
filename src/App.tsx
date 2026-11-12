import { LineChart } from 'lucide-react';
import { Layout } from '@/components/layout/Layout';
import { ComingSoon } from '@/components/layout/ComingSoon';
import { useRoute, type RoutePath } from '@/app/router';
import { useCurrentUser } from '@/app/session';
import { LoginScreen } from '@/modules/auth/LoginScreen';
import { useI18n } from '@/i18n';
import { SchedulePage } from '@/modules/calendar/SchedulePage';
import { EmployeesPage } from '@/modules/employees/EmployeesPage';
import { PurchaseOrdersPage } from '@/modules/purchasing/PurchaseOrdersPage';
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
      return <PurchaseOrdersPage />;
    case '/financial':
      return <ComingSoon phase={4} icon={LineChart} title={t('app.nav.financial')} description={t('comingSoon.financialDescription')} />;
  }
}

export default function App() {
  const { path } = useRoute();
  const user = useCurrentUser();
  if (!user) return <LoginScreen />;
  return (
    <Layout>
      <Page key={path} path={path} />
    </Layout>
  );
}
