import { useState } from 'react';
import { Camera, CheckCircle2, Circle, ClipboardCheck, Clock3, MessageSquareText, X } from 'lucide-react';
import { createPortal } from 'react-dom';
import { StatusBadge } from '@/components/ui/Badge';
import type { PortalUpdate, PortalView } from '@/domain/portal';
import { formatMinutes } from '@/domain/timeTracking';
import { useI18n } from '@/i18n';
import { cn } from '@/lib/cn';
import { getFormatLocale } from '@/lib/format';

const fmtDateTime = (iso: string) =>
  new Date(iso).toLocaleString(getFormatLocale(), { day: '2-digit', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit' });

const KIND_ICON = { assessment: ClipboardCheck, phase: CheckCircle2, note: MessageSquareText } as const;

/**
 * Relatório do cliente (o que o cliente vê): andamento das fases aprovadas + linha do tempo das atualizações aprovadas
 * com fotos. Usado no portal e na pré-visualização do Office — os dois mostram exatamente a mesma coisa.
 */
export function CustomerReportView({ view }: { view: PortalView }) {
  const { t } = useI18n();
  const [zoom, setZoom] = useState<string>();
  const done = view.phases.filter((p) => p.done).length;
  const timeline = [...view.updates].reverse(); // mais recente primeiro

  return (
    <div className="space-y-5">
      <section className="card p-5">
        <p className="font-mono text-xs font-semibold text-slate-500">{view.projectNumber}</p>
        <h2 className="text-xl font-bold text-slate-900 dark:text-white">{view.customer}</h2>
        {view.description && <p className="mt-0.5 text-sm text-slate-600 dark:text-slate-300">{view.description}</p>}
        <div className="mt-3 flex flex-wrap items-center gap-2 text-sm">
          <StatusBadge kind="projectStatus" value={view.status} />
          {view.lastUpdate && <span className="text-slate-500">{t('portal.view.lastUpdate', { date: fmtDateTime(view.lastUpdate) })}</span>}
        </div>
      </section>

      <section className="card p-5">
        <div className="mb-3 flex items-center justify-between gap-2">
          <h3 className="font-semibold text-slate-900 dark:text-white">{t('portal.view.progress')}</h3>
          <span className="text-sm text-slate-500 tabular-nums">{t('portal.view.phasesDone', { done, total: view.phases.length })}</span>
        </div>
        <div className="mb-4 h-2 overflow-hidden rounded-full bg-slate-100 dark:bg-slate-800">
          <div className="h-full rounded-full bg-green-500 transition-all" style={{ width: `${(done / Math.max(1, view.phases.length)) * 100}%` }} />
        </div>
        <ol className="grid gap-2 sm:grid-cols-2">
          {view.phases.map((p) => (
            <li key={p.id} className={cn('flex items-center gap-2 text-sm', !p.done && 'text-slate-400')}>
              {p.done ? <CheckCircle2 className="size-5 shrink-0 text-green-600" /> : <Circle className="size-5 shrink-0" />}
              <span className={cn(p.done && 'font-medium text-slate-900 dark:text-white')}>{p.name}</span>
              {p.minutes ? <span className="ml-auto text-xs text-slate-500 tabular-nums">{formatMinutes(p.minutes)}</span> : null}
            </li>
          ))}
        </ol>
        {view.totalMinutes > 0 && (
          <p className="mt-3 flex items-center gap-1.5 border-t border-slate-100 pt-3 text-sm text-slate-600 dark:border-slate-800 dark:text-slate-300">
            <Clock3 className="size-4" /> {t('portal.view.totalHours', { time: formatMinutes(view.totalMinutes) })}
          </p>
        )}
      </section>

      <section>
        <h3 className="mb-2 font-semibold text-slate-900 dark:text-white">{t('portal.view.updates')}</h3>
        {timeline.length === 0 ? (
          <p className="card p-5 text-sm text-slate-500">{t('portal.view.noUpdates')}</p>
        ) : (
          <ol className="space-y-3">
            {timeline.map((u) => (
              <UpdateCard key={u.id} u={u} onZoom={setZoom} />
            ))}
          </ol>
        )}
      </section>

      {zoom &&
        createPortal(
          <div className="fixed inset-0 z-[80] flex items-center justify-center bg-black/85 p-4" onClick={() => setZoom(undefined)} role="dialog" aria-modal="true">
            <img src={zoom} alt="" className="max-h-full max-w-full rounded-lg object-contain" />
            <button className="absolute top-4 right-4 rounded-full bg-white/15 p-2 text-white" aria-label={t('common.close')} onClick={() => setZoom(undefined)}>
              <X className="size-6" />
            </button>
          </div>,
          document.body,
        )}
    </div>
  );
}

function UpdateCard({ u, onZoom }: { u: PortalUpdate; onZoom: (src: string) => void }) {
  const { t } = useI18n();
  const Icon = KIND_ICON[u.kind];
  return (
    <li className="card break-inside-avoid p-4">
      <div className="flex items-start gap-3">
        <span className={cn('mt-0.5 rounded-lg p-1.5', u.kind === 'phase' ? 'bg-green-50 text-green-700 dark:bg-green-500/10 dark:text-green-300' : 'bg-slate-100 text-slate-600 dark:bg-slate-800 dark:text-slate-300')}>
          <Icon className="size-4" />
        </span>
        <div className="min-w-0 flex-1">
          <p className="text-xs font-semibold tracking-wide text-slate-500 uppercase">{t(`portal.kind.${u.kind}`)}</p>
          <p className="font-semibold text-slate-900 dark:text-white">{u.kind === 'phase' ? t('portal.view.phaseDone', { phase: u.title }) : u.title}</p>
          <p className="text-xs text-slate-500">
            {fmtDateTime(u.createdAt)}
            {u.minutes ? <> · {t('portal.view.hours', { time: formatMinutes(u.minutes) })}</> : null}
          </p>
          {u.text && <p className="mt-2 text-sm whitespace-pre-line text-slate-700 dark:text-slate-200">{u.text}</p>}
          {u.photos.length > 0 && (
            <ul className="mt-3 grid grid-cols-3 gap-2 sm:grid-cols-4">
              {u.photos.map((src, i) => (
                <li key={i}>
                  <button type="button" onClick={() => onZoom(src)} className="block w-full" aria-label={t('portal.view.openPhoto')}>
                    <img src={src} alt="" className="aspect-square w-full rounded-lg bg-slate-100 object-cover dark:bg-slate-800" />
                  </button>
                </li>
              ))}
            </ul>
          )}
          {u.photos.length > 0 && (
            <p className="mt-1 flex items-center gap-1 text-[11px] text-slate-400">
              <Camera className="size-3" /> {t('portal.view.photos', { count: u.photos.length })}
            </p>
          )}
        </div>
      </div>
    </li>
  );
}
