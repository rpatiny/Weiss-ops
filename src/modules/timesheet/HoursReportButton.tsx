import { useState } from 'react';
import { FileSpreadsheet, Info, UserRound } from 'lucide-react';
import { useCan } from '@/app/session';
import { Button } from '@/components/ui/Button';
import { useToast } from '@/components/ui/Toast';
import { useCollection } from '@/data/hooks';
import { completedProjectIds, exportAllProjectsReport, exportEmployeeHoursReport, exportHoursReport, reportCheck, type ExportResult } from '@/domain/hoursReport';
import { Field, Select } from '@/components/ui/Field';
import { Modal } from '@/components/ui/Modal';
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

/** Botões do topo de "Horas da oficina": exportar todos os projetos (uma planilha por projeto) ou por funcionário. */
export function ExportHoursActions() {
  const { t } = useI18n();
  const toast = useToast();
  const allowed = useCan()('time.manage');
  const workPhases = useCollection('workPhases');
  const timeEntries = useCollection('timeEntries');
  const employees = useCollection('employees');
  const [picking, setPicking] = useState(false);
  const [choice, setChoice] = useState('all');
  const [busy, setBusy] = useState(false);
  if (!allowed) return null;

  const done = completedProjectIds({ workPhases, timeEntries });
  const withHours = new Set(timeEntries.filter((e) => done.includes(e.projectId)).map((e) => e.employeeId));
  const employeeOptions = [{ value: 'all', label: t('timesheet.allEmployees') }, ...employees.filter((e) => withHours.has(e.id)).map((e) => ({ value: e.id, label: e.name }))];

  const run = async (fn: () => Promise<ExportResult>) => {
    setBusy(true);
    try {
      const r = await fn();
      if (r.ok) {
        toast.success(t('timesheet.reportDone', { file: r.filename }));
        setPicking(false);
      } else toast.error(t(r.reason));
    } finally {
      setBusy(false);
    }
  };

  return (
    <>
      <div className="flex flex-wrap gap-2">
        <Button variant="primary" icon={FileSpreadsheet} disabled={busy || done.length === 0} title={done.length === 0 ? t('timesheet.noCompleted') : undefined} onClick={() => run(exportAllProjectsReport)}>
          {t('timesheet.exportAll')}
        </Button>
        <Button
          icon={UserRound}
          onClick={() => {
            setChoice('all');
            setPicking(true);
          }}
        >
          {t('timesheet.exportByEmployee')}
        </Button>
      </div>
      <Modal
        open={picking}
        onClose={() => setPicking(false)}
        title={t('timesheet.exportByEmployee')}
        footer={
          <Button variant="primary" icon={FileSpreadsheet} onClick={() => run(() => exportEmployeeHoursReport(choice))} disabled={busy || done.length === 0}>
            {t('timesheet.export')}
          </Button>
        }
      >
        <p className="mb-3 flex gap-2 rounded-lg bg-slate-50 p-3 text-sm text-slate-600 dark:bg-slate-800/50 dark:text-slate-300">
          <Info className="mt-0.5 size-4 shrink-0" /> {t('timesheet.onlyCompletedHint')}
        </p>
        {done.length === 0 ? (
          <p className="text-sm text-slate-500">{t('timesheet.noCompleted')}</p>
        ) : (
          <Field label={t('timesheet.chooseEmployee')}>{(id) => <Select id={id} value={choice} onChange={setChoice} options={employeeOptions} />}</Field>
        )}
      </Modal>
    </>
  );
}
