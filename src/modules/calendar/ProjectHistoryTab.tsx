import { useMemo, useState } from 'react';
import { Copy, Download, History, Search } from 'lucide-react';
import { Button } from '@/components/ui/Button';
import { EmptyState } from '@/components/ui/misc';
import { useToast } from '@/components/ui/Toast';
import { useCollection } from '@/data/hooks';
import { auditText } from '@/data/audit';
import { useI18n } from '@/i18n';
import { cn } from '@/lib/cn';
import { getFormatLocale } from '@/lib/format';
import type { Project } from '@/types/models';

const fmtWhen = (iso: string) =>
  new Date(iso).toLocaleString(getFormatLocale(), { day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit', second: '2-digit' });

const ACTION_TONE = { create: 'text-green-700 dark:text-green-400', update: 'text-blue-700 dark:text-blue-400', delete: 'text-red-600' } as const;

/**
 * Histórico de mudanças do projeto (só Master): tudo o que mexeu no projeto e no que é dele — equipe, materiais,
 * requisições, POs, horas, atualizações do cliente, spindle — com data/hora, quem e o quê. Texto puro, copiar/baixar.
 */
export function ProjectHistoryTab({ project }: { project: Project }) {
  const { t } = useI18n();
  const toast = useToast();
  const log = useCollection('auditLog');
  const [query, setQuery] = useState('');
  const entries = useMemo(() => log.filter((e) => e.projectIds.includes(project.id)).sort((a, b) => b.at.localeCompare(a.at)), [log, project.id]);
  const q = query.trim().toLowerCase();
  const shown = q ? entries.filter((e) => `${e.actor} ${e.collection} ${e.label} ${e.action} ${e.changes.join(' ')}`.toLowerCase().includes(q)) : entries;

  const text = () => `${t('audit.reportTitle', { number: project.projectNumber, customer: project.customer })}\n${'='.repeat(60)}\n${auditText(shown, fmtWhen)}\n`;
  const download = () => {
    const blob = new Blob([text()], { type: 'text/plain;charset=utf-8' });
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = `history-${project.projectNumber}.txt`;
    a.click();
    URL.revokeObjectURL(a.href);
  };

  return (
    <div className="space-y-3">
      <p className="text-sm text-slate-500">{t('audit.hint')}</p>
      <div className="flex flex-wrap items-center gap-2">
        <div className="relative min-w-0 flex-1">
          <Search className="pointer-events-none absolute top-1/2 left-3 size-4 -translate-y-1/2 text-slate-400" />
          <input className="input pl-9" value={query} onChange={(e) => setQuery(e.target.value)} placeholder={t('audit.search')} aria-label={t('audit.search')} />
        </div>
        <Button
          icon={Copy}
          disabled={!shown.length}
          onClick={() => {
            void navigator.clipboard?.writeText(text());
            toast.success(t('portal.copied'));
          }}
        >
          {t('audit.copy')}
        </Button>
        <Button icon={Download} disabled={!shown.length} onClick={download}>
          .txt
        </Button>
      </div>

      {shown.length === 0 ? (
        <EmptyState icon={History} title={t('audit.empty')} description={t('audit.emptyHint')} />
      ) : (
        <ol className="max-h-[60vh] divide-y divide-slate-100 overflow-y-auto rounded-lg border border-slate-200 bg-white font-mono text-xs dark:divide-slate-800 dark:border-slate-800 dark:bg-slate-950">
          {shown.map((e) => (
            <li key={e.id} className="px-3 py-2">
              <p className="flex flex-wrap gap-x-2">
                <span className="text-slate-500 tabular-nums">{fmtWhen(e.at)}</span>
                <span className="font-semibold text-slate-900 dark:text-white">{e.actor}</span>
                <span className={cn('font-semibold uppercase', ACTION_TONE[e.action])}>{t(`audit.action.${e.action}`)}</span>
                <span className="text-slate-600 dark:text-slate-300">
                  {e.collection} · {e.label}
                </span>
              </p>
              {e.changes.length > 0 && (
                <ul className="mt-1 space-y-0.5 pl-4 text-slate-600 dark:text-slate-300">
                  {e.changes.map((c, i) => (
                    <li key={i} className="break-words">
                      · {c}
                    </li>
                  ))}
                </ul>
              )}
            </li>
          ))}
        </ol>
      )}
      <p className="text-xs text-slate-400">{t('audit.count', { count: shown.length })}</p>
    </div>
  );
}
