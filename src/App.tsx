import { Layout } from '@/components/layout/Layout';
import { useRoute, type RoutePath } from '@/app/router';
import { useCurrentUser } from '@/app/session';
import { LoginScreen } from '@/modules/auth/LoginScreen';
import { SchedulePage } from '@/modules/calendar/SchedulePage';
import { EmployeesPage } from '@/modules/employees/EmployeesPage';
import { PurchaseOrdersPage } from '@/modules/purchasing/PurchaseOrdersPage';
import { ExtensionsPage } from '@/modules/extensions/ExtensionsPage';
import { lazy, Suspense } from 'react';

// Hub Financeiro (recharts) carregado sob demanda para manter o pacote inicial leve.
const FinancialPage = lazy(() => import('@/modules/financial/FinancialPage').then((m) => ({ default: m.FinancialPage })));
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
      return (
        <Suspense fallback={<div className="card h-64 animate-pulse" />}>
          <FinancialPage />
        </Suspense>
      );
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
