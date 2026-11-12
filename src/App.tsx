import { CalendarRange, ClipboardList, LineChart } from 'lucide-react';
import { Layout } from '@/components/layout/Layout';
import { ComingSoon } from '@/components/layout/ComingSoon';
import { useRoute, type RoutePath } from '@/app/router';
import { EmployeesPage } from '@/modules/employees/EmployeesPage';
import { SettingsPage } from '@/modules/settings/SettingsPage';

function Page({ path }: { path: RoutePath }) {
  switch (path) {
    case '/employees':
      return <EmployeesPage />;
    case '/settings':
      return <SettingsPage />;
    case '/calendar':
      return <ComingSoon phase={2} icon={CalendarRange} title="Agenda & Rotas" description="Calendário semanal, quinzenal, mensal e grade de escala." />;
    case '/purchase-orders':
      return <ComingSoon phase={3} icon={ClipboardList} title="Ordens de Compra" description="POs, itens de linha, entregas e anexos." />;
    case '/financial':
      return <ComingSoon phase={4} icon={LineChart} title="Hub Financeiro" description="Spindles, cotações, entregas e forecast." />;
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
