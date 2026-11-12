import { useEffect, useMemo, useState } from 'react';
import { Ban, CheckCircle2, Globe2, Loader, MessageSquare, PackageX, Play, Send, Inbox } from 'lucide-react';
import { clearParams, navigate, useRoute } from '@/app/router';
import { useCan } from '@/app/session';
import { StatusBadge } from '@/components/ui/Badge';
import { Button } from '@/components/ui/Button';
import { Drawer } from '@/components/ui/Drawer';
import { Field, Input } from '@/components/ui/Field';
import { EmptyState, StatCard } from '@/components/ui/misc';
import { useToast } from '@/components/ui/Toast';
import { repos } from '@/data/db';
import { useCollection } from '@/data/hooks';
import { extensionService, isExtensionOpen, plantState } from '@/domain/extensions';
import { useI18n } from '@/i18n';
import { HOME_PLANT } from '@/lib/config';
import { cn } from '@/lib/cn';
import { addDays } from '@/lib/dates';
import { formatDate } from '@/lib/format';
import { usePurchasingData } from '@/modules/purchasing/usePurchasingData';
import { ExtensionFormDrawer, type ExtensionPrefill } from './ExtensionFormDrawer';

/** Tela dedicada às extensões de material no SAP (visual índigo, separado das compras). */
export function ExtensionsPage() {
  const { t } = useI18n();
  const allowed = useCan();
  const { params, path } = useRoute();
  const pd = usePurchasingData();
  const extensions = useCollection('extensions');
  const users = useCollection('users');
  const [filter, setFilter] = useState<'open' | 'all'>('open');
  const [creating, setCreating] = useState<ExtensionPrefill | null>(null);
  const [detail, setDetail] = useState<string>();

  const openParam = path === '/extensions' ? params.get('open') : null;
  useEffect(() => {
    if (!openParam) return;
    if (repos.extensions.getById(openParam)) setDetail(openParam);
    clearParams('open');
  }, [openParam]);

  /** Materiais de projetos ativos que não estão estendidos para a planta de compra (e sem pedido). */
  const missing = useMemo(() => {
    const out: { pn: string; description: string; projects: { id: string; number: string; color: string }[]; neededBy?: string }[] = [];
    for (const demand of pd.demand.values()) {
      const pn = demand[0]!.material.partNumber;
      if (plantState(pn, pd.catalogByPN, extensions).state !== 'missing') continue;
      if (demand.every((d) => d.view.status === 'received')) continue;
      out.push({
        pn,
        description: demand[0]!.material.description,
        projects: [...new Map(demand.map((d) => [d.project.id, { id: d.project.id, number: d.project.projectNumber, color: d.project.color }])).values()],
        neededBy: demand.map((d) => d.material.neededBy ?? d.start).filter((x): x is string => !!x).sort()[0],
      });
    }
    return out;
  }, [pd, extensions]);

  const rows = extensions
    .filter((x) => filter === 'all' || isExtensionOpen(x))
    .sort((a, b) => Number(isExtensionOpen(b)) - Number(isExtensionOpen(a)) || b.requestedAt.localeCompare(a.requestedAt));
  const since = addDays(pd.today, -30);
  const done30 = extensions.filter((x) => x.status === 'extended' && x.history.some((h) => h.action === 'extended' && h.at.slice(0, 10) >= since)).length;

  return (
    <>
      {/* Cabeçalho próprio (índigo) para diferenciar das compras */}
      <div className="mb-6 overflow-hidden rounded-xl bg-gradient-to-r from-indigo-700 to-indigo-500 p-5 text-white shadow-sm">
        <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
          <div className="flex items-center gap-3">
            <div className="flex size-11 items-center justify-center rounded-lg bg-white/15">
              <Globe2 className="size-6" />
            </div>
            <div>
              <h1 className="text-xl font-bold sm:text-2xl">{t('extensions.title')}</h1>
              <p className="text-sm text-indigo-100">{t('extensions.description', { plant: HOME_PLANT })}</p>
            </div>
          </div>
          {allowed('extension.request') && (
            <Button className="bg-white text-indigo-700 hover:bg-indigo-50" icon={Send} onClick={() => setCreating({})}>
              {t('extensions.new')}
            </Button>
          )}
        </div>
        <p className="mt-3 rounded-lg bg-white/10 px-3 py-2 text-sm text-indigo-50">{t('extensions.banner', { plant: HOME_PLANT })}</p>
      </div>

      <div className="mb-6 grid grid-cols-2 gap-3 lg:grid-cols-4">
        <StatCard label={t('extensions.kpi.open')} value={extensions.filter((x) => x.status === 'requested').length} icon={Inbox} tone="info" onClick={() => setFilter('open')} />
        <StatCard label={t('extensions.kpi.inProgress')} value={extensions.filter((x) => x.status === 'in_progress').length} icon={Loader} tone="warning" onClick={() => setFilter('open')} />
        <StatCard label={t('extensions.kpi.done30')} value={done30} icon={CheckCircle2} tone="success" onClick={() => setFilter('all')} />
        <StatCard label={t('extensions.kpi.missing')} value={missing.length} icon={PackageX} tone={missing.length ? 'danger' : 'default'} hint={t('extensions.kpi.missingHint')} />
      </div>

      {missing.length > 0 && (
        <section className="card mb-6 overflow-hidden border-red-200 dark:border-red-900/60">
          <h2 className="border-b border-red-200 bg-red-50 px-4 py-3 font-semibold text-red-800 dark:border-red-900/60 dark:bg-red-950/30 dark:text-red-300">{t('extensions.missingTitle', { plant: HOME_PLANT })}</h2>
          <ul className="divide-y divide-slate-100 dark:divide-slate-800">
            {missing.map((m) => (
              <li key={m.pn} className="flex flex-wrap items-center gap-3 px-4 py-2.5 text-sm">
                <div className="min-w-0 flex-1">
                  <p className="font-medium">{m.description}</p>
                  <p className="font-mono text-xs text-slate-500">{m.pn}</p>
                </div>
                <div className="flex flex-wrap gap-1">
                  {m.projects.map((p) => (
                    <span key={p.id} className="rounded px-1.5 py-0.5 font-mono text-[10px] text-white" style={{ backgroundColor: p.color }}>
                      {p.number}
                    </span>
                  ))}
                </div>
                {m.neededBy && <span className="text-xs text-slate-500">{formatDate(m.neededBy)}</span>}
                {allowed('extension.request') && (
                  <Button size="sm" className="border-indigo-300 text-indigo-700 dark:text-indigo-300" icon={Send} onClick={() => setCreating({ partNumber: m.pn, description: m.description, projectId: m.projects[0]?.id, neededBy: m.neededBy })}>
                    {t('extensions.badge.request')}
                  </Button>
                )}
              </li>
            ))}
          </ul>
        </section>
      )}

      <div className="card overflow-hidden">
        <div className="flex gap-1 border-b border-slate-200 p-4 dark:border-slate-800">
          {(['open', 'all'] as const).map((f) => (
            <button
              key={f}
              onClick={() => setFilter(f)}
              aria-pressed={filter === f}
              className={cn('rounded-full border px-3 py-1 text-xs font-medium', filter === f ? 'border-indigo-600 bg-indigo-600 text-white' : 'border-slate-300 text-slate-600 dark:border-slate-700 dark:text-slate-400')}
            >
              {f === 'open' ? t('extensions.filterOpen') : t('extensions.filterAll')}
            </button>
          ))}
        </div>
        {rows.length === 0 ? (
          <EmptyState icon={Globe2} title={t('extensions.empty')} />
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full min-w-[760px]">
              <thead className="bg-slate-50 dark:bg-slate-800/50">
                <tr>
                  <th className="th">{t('extensions.number')}</th>
                  <th className="th">{t('extensions.material')}</th>
                  <th className="th">{t('extensions.plants')}</th>
                  <th className="th">{t('extensions.project')}</th>
                  <th className="th">{t('extensions.requestedBy')}</th>
                  <th className="th">{t('extensions.neededBy')}</th>
                  <th className="th">{t('common.status')}</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100 dark:divide-slate-800">
                {rows.map((x) => {
                  const project = pd.projects.find((p) => p.id === x.projectId);
                  const overdue = isExtensionOpen(x) && !!x.neededBy && x.neededBy < pd.today;
                  return (
                    <tr key={x.id} onClick={() => setDetail(x.id)} className={cn('cursor-pointer hover:bg-slate-50 dark:hover:bg-slate-800/40', isExtensionOpen(x) && 'bg-indigo-50/40 dark:bg-indigo-950/10')}>
                      <td className="td">
                        <p className="font-mono font-semibold">{x.number}</p>
                        <p className="text-xs text-slate-500">{formatDate(x.requestedAt)}</p>
                      </td>
                      <td className="td">
                        <p className="font-medium">{x.description}</p>
                        <p className="font-mono text-xs text-slate-500">{x.partNumber}</p>
                      </td>
                      <td className="td font-mono text-sm">
                        {x.fromPlant} → <strong>{x.toPlant}</strong>
                      </td>
                      <td className="td">
                        {project && (
                          <span className="rounded px-1.5 py-0.5 font-mono text-[10px] text-white" style={{ backgroundColor: project.color }}>
                            {project.projectNumber}
                          </span>
                        )}
                      </td>
                      <td className="td text-sm">{users.find((u) => u.id === x.requestedBy)?.name ?? '—'}</td>
                      <td className={cn('td text-sm', overdue && 'font-semibold text-red-600')}>{formatDate(x.neededBy)}</td>
                      <td className="td">
                        <StatusBadge kind="extensionStatus" value={x.status} />
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>

      <ExtensionFormDrawer open={!!creating} prefill={creating ?? undefined} onClose={() => setCreating(null)} />
      <ExtensionDetailDrawer id={detail} onClose={() => setDetail(undefined)} />
    </>
  );
}

function ExtensionDetailDrawer({ id, onClose }: { id?: string; onClose: () => void }) {
  const { t } = useI18n();
  const toast = useToast();
  const allowed = useCan();
  const x = useCollection('extensions').find((e) => e.id === id);
  const users = useCollection('users');
  const projects = useCollection('projects');
  const suppliers = useCollection('suppliers');
  const [sapRef, setSapRef] = useState('');
  const [reason, setReason] = useState('');
  const [rejecting, setRejecting] = useState(false);
  const [reasonError, setReasonError] = useState(false);
  const [comment, setComment] = useState('');

  if (!x) return null;
  const project = projects.find((p) => p.id === x.projectId);
  const userName = (uid: string) => users.find((u) => u.id === uid)?.name ?? '—';
  const open = isExtensionOpen(x);

  return (
    <Drawer
      open={!!id}
      onClose={onClose}
      width="lg"
      title={
        <span className="flex items-center gap-2">
          <Globe2 className="size-5 text-indigo-500" /> {t('extensions.detailTitle', { number: x.number })} <StatusBadge kind="extensionStatus" value={x.status} />
        </span>
      }
      subtitle={`${x.partNumber} · ${x.description}`}
      footer={<Button onClick={onClose}>{t('common.close')}</Button>}
    >
      <div className="space-y-6">
        <dl className="grid gap-4 text-sm sm:grid-cols-3">
          <div>
            <dt className="text-xs text-slate-500">{t('extensions.plants')}</dt>
            <dd className="font-mono font-semibold">
              {x.fromPlant} → {x.toPlant}
            </dd>
          </div>
          <div>
            <dt className="text-xs text-slate-500">{t('extensions.form.supplier')}</dt>
            <dd className="font-medium">{suppliers.find((s) => s.id === x.supplierId)?.name ?? '—'}</dd>
          </div>
          <div>
            <dt className="text-xs text-slate-500">{t('extensions.neededBy')}</dt>
            <dd className="font-medium">{formatDate(x.neededBy)}</dd>
          </div>
          <div>
            <dt className="text-xs text-slate-500">{t('extensions.requestedBy')}</dt>
            <dd className="font-medium">
              {userName(x.requestedBy)} · {formatDate(x.requestedAt)}
            </dd>
          </div>
          {project && (
            <div className="sm:col-span-2">
              <dt className="text-xs text-slate-500">{t('extensions.project')}</dt>
              <dd>
                <button type="button" className="font-medium text-indigo-700 hover:underline dark:text-indigo-300" onClick={() => { onClose(); navigate('/calendar', { open: project.id }); }}>
                  {project.projectNumber} · {project.customer}
                </button>
              </dd>
            </div>
          )}
          {x.sapReference && (
            <div>
              <dt className="text-xs text-slate-500">SAP</dt>
              <dd className="font-mono">{x.sapReference}</dd>
            </div>
          )}
          {x.notes && <dd className="rounded-lg bg-slate-50 p-3 whitespace-pre-line sm:col-span-3 dark:bg-slate-800/50">{x.notes}</dd>}
        </dl>

        {open && allowed('extension.process') && (
          <section className="space-y-3 rounded-lg border border-indigo-200 bg-indigo-50/50 p-4 dark:border-indigo-900 dark:bg-indigo-950/20">
            {x.status === 'requested' && (
              <Button icon={Play} onClick={() => { extensionService.start(x.id); toast.success(t('extensions.started')); }}>
                {t('extensions.start')}
              </Button>
            )}
            <Field label={t('extensions.sapReference')}>
              {(fid) => <Input id={fid} name="sapRef" value={sapRef} onChange={(e) => setSapRef(e.target.value)} className="font-mono" />}
            </Field>
            <div className="flex flex-wrap gap-2">
              <Button variant="primary" className="bg-indigo-600 text-white hover:bg-indigo-500" icon={CheckCircle2} onClick={() => { extensionService.complete(x.id, sapRef); toast.success(t('extensions.completed', { plant: x.toPlant })); setSapRef(''); }}>
                {t('extensions.complete')}
              </Button>
              <Button variant="ghost" icon={Ban} className="text-red-600" onClick={() => setRejecting(true)}>
                {t('extensions.reject')}
              </Button>
            </div>
            {rejecting && (
              <div className="space-y-2">
                <Input value={reason} onChange={(e) => { setReason(e.target.value); setReasonError(false); }} placeholder={t('extensions.reason')} invalid={reasonError} aria-label={t('extensions.reason')} />
                {reasonError && <p className="text-xs text-red-600">{t('extensions.reasonRequired')}</p>}
                <div className="flex justify-end gap-2">
                  <Button size="sm" onClick={() => setRejecting(false)}>
                    {t('common.cancel')}
                  </Button>
                  <Button size="sm" variant="danger" onClick={() => { if (!reason.trim()) return setReasonError(true); extensionService.reject(x.id, reason.trim()); toast.success(t('extensions.rejected')); setRejecting(false); setReason(''); }}>
                    {t('extensions.reject')}
                  </Button>
                </div>
              </div>
            )}
          </section>
        )}

        <section>
          <h3 className="mb-2 font-semibold">{t('extensions.history')}</h3>
          <ol className="relative space-y-3 border-l border-slate-200 pl-4 dark:border-slate-700">
            {[...x.history].reverse().map((h, i) => (
              <li key={i} className="text-sm">
                <span className="absolute -left-1.5 mt-1.5 size-3 rounded-full border-2 border-white bg-indigo-500 dark:border-slate-900" />
                <p>
                  <strong>{userName(h.userId)}</strong> {t(`extensions.events.${h.action}`)}
                  <span className="ml-2 text-xs text-slate-500">{new Date(h.at).toLocaleString(undefined, { dateStyle: 'short', timeStyle: 'short' })}</span>
                </p>
                {h.note && <p className="text-slate-600 dark:text-slate-400">{h.note}</p>}
              </li>
            ))}
          </ol>
          {(allowed('extension.request') || allowed('extension.process')) && (
            <form
              className="mt-3 flex gap-2"
              onSubmit={(e) => {
                e.preventDefault();
                if (!comment.trim()) return;
                extensionService.comment(x.id, comment.trim());
                setComment('');
                toast.success(t('extensions.commented'));
              }}
            >
              <Input value={comment} onChange={(e) => setComment(e.target.value)} placeholder={t('extensions.commentPlaceholder')} aria-label={t('extensions.commentPlaceholder')} />
              <Button type="submit" icon={comment.trim() ? Send : MessageSquare} aria-label={t('extensions.commentPlaceholder')} />
            </form>
          )}
        </section>
      </div>
    </Drawer>
  );
}
