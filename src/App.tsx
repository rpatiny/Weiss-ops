import { Layout } from '@/components/layout/Layout';
import { useRoute, type RoutePath } from '@/app/router';
import { useCurrentUser } from '@/app/session';
import { LoginScreen } from '@/modules/auth/LoginScreen';
import { SchedulePage } from '@/modules/calendar/SchedulePage';
import { EmployeesPage } from '@/modules/employees/EmployeesPage';
import { PurchaseOrdersPage } from '@/modules/purchasing/PurchaseOrdersPage';
import { ExtensionsPage } from '@/modules/extensions/ExtensionsPage';
import { FinancialPage } from '@/modules/financial/FinancialPage';
import { SettingsPage } from '@/modules/settings/SettingsPage';

function Page({ path }: { path: RoutePath }) {
  switch (path) {
    case '/employees':
      return <EmployeesPage />;
    case '/settings':
      return <SettingsPage />;
    case '/calendar':
      return <SchedulePage />;
    case '/purchase-orders':
      return <PurchaseOrdersPage />;
    case '/extensions':
      return <ExtensionsPage />;
    case '/financial':
      return <FinancialPage />;
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
