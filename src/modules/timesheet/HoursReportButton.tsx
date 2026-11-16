import { useState } from 'react';
import { FileSpreadsheet } from 'lucide-react';
import { useCan } from '@/app/session';
import { Button } from '@/components/ui/Button';
import { useToast } from '@/components/ui/Toast';
import { useCollection } from '@/data/hooks';
import { exportHoursReport, reportCheck } from '@/domain/hoursReport';
import { useI18n } from '@/i18n';

/**
 * Exporta o relatório de horas do projeto — só aparece com o serviço concluído (todas as fases, nada aberto).
 * Não existe relatório parcial: serviço em andamento é conferido na tela.
 */
export function HoursReportButton({ projectId, size = 'sm' }: { projectId: string; size?: 'sm' | 'md' }) {
  const { t } = useI18n();
  const toast = useToast();
  const allowed = useCan()('time.manage');
  const workPhases = useCollection('workPhases');
  const timeEntries = useCollection('timeEntries');
  const [busy, setBusy] = useState(false);
  if (!allowed || !reportCheck(projectId, { workPhases, timeEntries }).ok) return null;
  return (
    <Button
      size={size}
      icon={FileSpreadsheet}
      disabled={busy}
      onClick={async () => {
        setBusy(true);
        try {
          const r = await exportHoursReport(projectId);
          if (r.ok) toast.success(t('timesheet.reportDone', { file: r.filename }));
          else toast.error(t(r.reason));
        } finally {
          setBusy(false);
        }
      }}
    >
      {t('timesheet.report')}
    </Button>
  );
}
