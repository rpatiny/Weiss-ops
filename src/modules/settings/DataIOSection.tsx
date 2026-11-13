import { useRef, useState } from 'react';
import { AlertTriangle, Download, FileJson, FileSpreadsheet, Upload } from 'lucide-react';
import { useCan } from '@/app/session';
import { Button } from '@/components/ui/Button';
import { ConfirmDialog, Modal } from '@/components/ui/Modal';
import { useToast } from '@/components/ui/Toast';
import { checkBackup, exportBackup, exportExcel, restoreBackup, type BackupCheck } from '@/domain/dataExchange';
import { useI18n } from '@/i18n';
import { getFormatLocale } from '@/lib/format';
import type { CollectionName } from '@/types/models';

const MAX_ISSUES = 8;

/** Exportação Excel (todos os perfis) e backup/restauração JSON (Master). */
export function DataIOSection() {
  const { t } = useI18n();
  const toast = useToast();
  const allowed = useCan();
  const fileRef = useRef<HTMLInputElement>(null);
  const [busy, setBusy] = useState(false);
  const [check, setCheck] = useState<BackupCheck | null>(null);

  const onExcel = async () => {
    setBusy(true);
    try {
      const file = await exportExcel();
      toast.success(t('dataio.excelDone', { file }));
    } catch {
      toast.error(t('dataio.downloadFailed'));
    } finally {
      setBusy(false);
    }
  };

  const onBackup = () => {
    try {
      toast.success(t('dataio.backupDone', { file: exportBackup() }));
    } catch {
      toast.error(t('dataio.downloadFailed'));
    }
  };

  const onFile = async (f: File | undefined) => {
    if (!f) return;
    setCheck(checkBackup(await f.text()));
    if (fileRef.current) fileRef.current.value = '';
  };

  const issues = check?.issues ?? [];

  return (
    <section className="card p-5 lg:col-span-2">
      <h2 className="mb-4 font-semibold text-slate-900 dark:text-white">{t('dataio.title')}</h2>
      <div className="grid gap-3 md:grid-cols-3">
        <div className="flex flex-col gap-3 rounded-lg border border-slate-200 p-4 dark:border-slate-800">
          <div className="flex items-center gap-2 font-medium">
            <FileSpreadsheet className="size-5 text-green-600" /> {t('dataio.excel')}
          </div>
          <p className="flex-1 text-xs text-slate-500">{t('dataio.excelHint')}</p>
          <Button variant="primary" icon={Download} onClick={onExcel} disabled={busy}>
            {t('dataio.excel')}
          </Button>
        </div>
        {allowed('data.manage') && (
          <>
            <div className="flex flex-col gap-3 rounded-lg border border-slate-200 p-4 dark:border-slate-800">
              <div className="flex items-center gap-2 font-medium">
                <FileJson className="size-5 text-blue-600" /> {t('dataio.backup')}
              </div>
              <p className="flex-1 text-xs text-slate-500">{t('dataio.backupHint')}</p>
              <Button icon={Download} onClick={onBackup}>
                {t('dataio.backup')}
              </Button>
            </div>
            <div className="flex flex-col gap-3 rounded-lg border border-amber-300 bg-amber-50/40 p-4 dark:border-amber-900 dark:bg-amber-950/20">
              <div className="flex items-center gap-2 font-medium">
                <Upload className="size-5 text-amber-600" /> {t('dataio.restore')}
              </div>
              <p className="flex-1 text-xs text-slate-500">{t('dataio.restoreHint')}</p>
              <input ref={fileRef} type="file" accept="application/json,.json" className="hidden" onChange={(e) => onFile(e.target.files?.[0])} aria-label={t('dataio.chooseFile')} />
              <Button icon={Upload} onClick={() => fileRef.current?.click()}>
                {t('dataio.chooseFile')}
              </Button>
            </div>
          </>
        )}
      </div>

      {/* Arquivo inválido: lista os problemas encontrados */}
      <Modal
        open={!!check && !check.ok}
        onClose={() => setCheck(null)}
        title={
          <span className="flex items-center gap-2">
            <AlertTriangle className="size-5 text-red-500" /> {t('dataio.invalidTitle')}
          </span>
        }
        footer={<Button onClick={() => setCheck(null)}>{t('common.close')}</Button>}
      >
        <ul className="max-h-72 list-disc space-y-1 overflow-y-auto pl-5" data-testid="backup-issues">
          {issues.slice(0, MAX_ISSUES).map((i, n) => (
            <li key={n}>{t(i.key, i.vars)}</li>
          ))}
          {issues.length > MAX_ISSUES && <li>{t('dataio.errors.more', { count: issues.length - MAX_ISSUES })}</li>}
        </ul>
      </Modal>

      {/* Arquivo válido: prévia + confirmação */}
      <ConfirmDialog
        open={!!check?.ok}
        title={t('dataio.previewTitle')}
        confirmLabel={t('dataio.confirmRestore')}
        message={
          check?.file && (
            <div className="space-y-3">
              <p>{t('dataio.previewInfo', { date: new Date(check.file.exportedAt).toLocaleString(getFormatLocale()), version: check.file.schemaVersion })}</p>
              <p className="font-medium text-slate-700 dark:text-slate-300">{t('dataio.counts')}</p>
              <ul className="grid grid-cols-2 gap-x-4 gap-y-0.5 text-xs">
                {Object.entries(check.counts ?? {}).map(([k, v]) => (
                  <li key={k} className="flex justify-between">
                    <span>{t(`settings.collections.${k as CollectionName}`)}</span>
                    <span className="tabular-nums">{v}</span>
                  </li>
                ))}
              </ul>
              <p className="text-red-600">{t('dataio.restoreHint')}</p>
            </div>
          )
        }
        onConfirm={() => {
          if (check?.file) restoreBackup(check.file);
          toast.success(t('dataio.restored'));
          setCheck(null);
        }}
        onCancel={() => setCheck(null)}
      />
    </section>
  );
}
