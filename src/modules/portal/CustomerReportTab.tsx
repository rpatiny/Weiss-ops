import { useMemo, useState } from 'react';
import { Ban, Check, Copy, Eye, EyeOff, ExternalLink, Link2, Link2Off, Pencil, Plus, RotateCcw, Save, Send, Trash2, TriangleAlert, Undo2, X } from 'lucide-react';
import { navigate } from '@/app/router';
import { useCan } from '@/app/session';
import { Badge } from '@/components/ui/Badge';
import { Button } from '@/components/ui/Button';
import { Field, Input, Select, Textarea } from '@/components/ui/Field';
import { ConfirmDialog, Modal } from '@/components/ui/Modal';
import { PhotoPicker } from '@/components/ui/PhotoPicker';
import { useToast } from '@/components/ui/Toast';
import { useCollection } from '@/data/hooks';
import { accountsForProject, buildPortalView, MAX_UPDATE_PHOTOS, portalService, portalUrl, updateAuthorName, updateService } from '@/domain/portal';
import { formatMinutes } from '@/domain/timeTracking';
import type { Tone } from '@/domain/labels';
import { useI18n } from '@/i18n';
import { cn } from '@/lib/cn';
import { getFormatLocale } from '@/lib/format';
import type { Project, ProjectUpdate, ProjectUpdateStatus } from '@/types/models';
import { CustomerReportView } from './CustomerReportView';

const STATUS_TONE: Record<ProjectUpdateStatus, Tone> = { pending: 'amber', approved: 'green', rejected: 'red' };
const when = (iso: string) => new Date(iso).toLocaleString(getFormatLocale(), { day: '2-digit', month: 'short', hour: '2-digit', minute: '2-digit' });

/**
 * Aba "Customer report" do projeto (Office/Master): link do cliente, nova avaliação/nota com fotos e a fila de revisão.
 * Nada vai ao cliente sem "Approve".
 */
export function CustomerReportTab({ project }: { project: Project }) {
  const { t } = useI18n();
  const toast = useToast();
  const canReview = useCan()('portal.review');
  const accounts = useCollection('customers');
  const all = useCollection('projectUpdates');
  const phases = useCollection('workPhases');
  const [adding, setAdding] = useState(false);
  const [preview, setPreview] = useState(false);
  const [disabling, setDisabling] = useState(false);

  const updates = useMemo(() => all.filter((u) => u.projectId === project.id), [all, project.id]);
  const groups: { status: ProjectUpdateStatus; list: ProjectUpdate[] }[] = (['pending', 'approved', 'rejected'] as const).map((status) => ({
    status,
    list: updates.filter((u) => u.status === status).sort((a, b) => (status === 'pending' ? a.createdAt.localeCompare(b.createdAt) : b.createdAt.localeCompare(a.createdAt))),
  }));
  const linked = accountsForProject(project, accounts).filter((a) => a.active);
  const url = project.portalToken ? portalUrl(project.portalToken) : '';

  const copy = (text: string) => {
    void navigator.clipboard?.writeText(text);
    toast.success(t('portal.copied'));
  };

  return (
    <div className="space-y-5">
      {/* Link do cliente */}
      <section className="card space-y-3 p-4">
        <h3 className="flex items-center gap-2 font-semibold">
          <Link2 className="size-4 text-slate-400" /> {t('portal.link.title')}
        </h3>
        {!project.portalToken ? (
          <>
            <p className="text-sm text-slate-500">{t('portal.link.off')}</p>
            {canReview && (
              <Button variant="primary" icon={Link2} onClick={() => { portalService.enable(project.id); toast.success(t('portal.link.created')); }}>
                {t('portal.link.create')}
              </Button>
            )}
          </>
        ) : (
          <>
            <div className="flex gap-2">
              <Input readOnly value={url} className="min-w-0 flex-1 font-mono text-xs" onFocus={(e) => e.target.select()} aria-label={t('portal.link.title')} />
              <Button icon={Copy} onClick={() => copy(url)} aria-label={t('portal.link.copy')} title={t('portal.link.copy')} />
            </div>
            <div className="flex flex-wrap gap-2">
              <Button size="sm" icon={Send} onClick={() => copy(t('portal.link.message', { customer: project.customer, number: project.projectNumber, url, username: linked[0]?.username ?? '—' }))}>
                {t('portal.link.copyMessage')}
              </Button>
              <a href={url} target="_blank" rel="noreferrer">
                <Button size="sm" icon={ExternalLink} tabIndex={-1}>
                  {t('portal.link.open')}
                </Button>
              </a>
              <Button size="sm" icon={Eye} onClick={() => setPreview(true)}>
                {t('portal.link.preview')}
              </Button>
              {canReview && (
                <Button size="sm" variant="ghost" icon={Link2Off} className="text-red-600" onClick={() => setDisabling(true)}>
                  {t('portal.link.disable')}
                </Button>
              )}
            </div>
          </>
        )}
        {linked.length > 0 ? (
          <p className="text-xs text-slate-500">{t('portal.link.accounts', { list: linked.map((a) => a.username).join(', ') })}</p>
        ) : (
          <p className="flex items-start gap-1.5 rounded-lg bg-amber-50 p-2 text-xs text-amber-800 dark:bg-amber-500/10 dark:text-amber-300">
            <TriangleAlert className="size-4 shrink-0" />
            <span>
              {t('portal.link.noAccount', { customer: project.customer })}{' '}
              <button type="button" className="font-semibold underline" onClick={() => navigate('/customers')}>
                {t('portal.link.goAccounts')}
              </button>
            </span>
          </p>
        )}
      </section>

      {/* Nova avaliação / nota */}
      {canReview &&
        (adding ? (
          <NewUpdateForm projectId={project.id} onDone={() => setAdding(false)} />
        ) : (
          <Button icon={Plus} onClick={() => setAdding(true)}>
            {t('portal.updates.add')}
          </Button>
        ))}

      {/* Fila de revisão */}
      {updates.length === 0 ? (
        <p className="rounded-lg border border-dashed border-slate-300 p-6 text-center text-sm text-slate-500 dark:border-slate-700">{t('portal.updates.empty')}</p>
      ) : (
        groups
          .filter((g) => g.list.length)
          .map((g) => (
            <section key={g.status} className="space-y-2">
              <h3 className="flex items-center gap-2 text-sm font-semibold">
                <Badge tone={STATUS_TONE[g.status]} dot>
                  {t(`portal.status.${g.status}`)}
                </Badge>
                <span className="text-slate-500 tabular-nums">{g.list.length}</span>
                {g.status === 'pending' && <span className="text-xs font-normal text-slate-500">{t('portal.updates.pendingHint')}</span>}
              </h3>
              <ul className="space-y-2">
                {g.list.map((u) => (
                  <UpdateRow key={u.id} u={u} canReview={canReview} />
                ))}
              </ul>
            </section>
          ))
      )}

      <Modal open={preview} onClose={() => setPreview(false)} title={t('portal.link.preview')}>
        <div className="max-h-[70vh] overflow-y-auto rounded-lg bg-slate-100 p-3 dark:bg-slate-950">
          <CustomerReportView view={buildPortalView(project, all, phases)} />
        </div>
      </Modal>
      <ConfirmDialog
        open={disabling}
        title={t('portal.link.disableTitle')}
        message={t('portal.link.disableMessage')}
        confirmLabel={t('portal.link.disable')}
        onCancel={() => setDisabling(false)}
        onConfirm={() => {
          portalService.disable(project.id);
          setDisabling(false);
          toast.success(t('portal.link.disabled'));
        }}
      />
    </div>
  );
}

function NewUpdateForm({ projectId, onDone }: { projectId: string; onDone: () => void }) {
  const { t } = useI18n();
  const toast = useToast();
  const [kind, setKind] = useState<'assessment' | 'note'>('assessment');
  const [title, setTitle] = useState('');
  const [text, setText] = useState('');
  const [photos, setPhotos] = useState<string[]>([]);
  const [error, setError] = useState(false);
  const save = () => {
    if (!title.trim() || (!text.trim() && photos.length === 0)) return setError(true);
    updateService.create(projectId, kind, title, text, photos);
    toast.success(t('portal.updates.created'));
    onDone();
  };
  return (
    <section className="animate-pop-in space-y-3 rounded-lg border border-brand-500/50 bg-brand-50/40 p-4 dark:bg-brand-500/5">
      <div className="grid gap-3 sm:grid-cols-[180px_1fr]">
        <Field label={t('portal.updates.kind')}>
          {(id) => <Select id={id} value={kind} onChange={(v) => setKind(v as 'assessment' | 'note')} options={[{ value: 'assessment', label: t('portal.kind.assessment') }, { value: 'note', label: t('portal.kind.note') }]} />}
        </Field>
        <Field label={t('portal.updates.title')} required>
          {(id) => <Input id={id} value={title} onChange={(e) => { setTitle(e.target.value); setError(false); }} placeholder={t(kind === 'assessment' ? 'portal.updates.assessmentPlaceholder' : 'portal.updates.notePlaceholder')} invalid={error && !title.trim()} />}
        </Field>
      </div>
      <Field label={t('portal.updates.text')} hint={t('portal.updates.textHint')}>
        {(id) => <Textarea id={id} rows={4} value={text} onChange={(e) => { setText(e.target.value); setError(false); }} />}
      </Field>
      <PhotoPicker value={photos} onChange={setPhotos} max={MAX_UPDATE_PHOTOS} />
      {error && <p className="text-sm text-red-600" role="alert">{t('portal.updates.required')}</p>}
      <div className="flex justify-end gap-2">
        <Button onClick={onDone}>{t('common.cancel')}</Button>
        <Button variant="primary" icon={Save} onClick={save}>
          {t('portal.updates.saveForReview')}
        </Button>
      </div>
    </section>
  );
}

function UpdateRow({ u, canReview }: { u: ProjectUpdate; canReview: boolean }) {
  const { t } = useI18n();
  const toast = useToast();
  const [editing, setEditing] = useState(false);
  const [title, setTitle] = useState(u.title);
  const [text, setText] = useState(u.text);
  const [photos, setPhotos] = useState(u.photos);
  const [rejecting, setRejecting] = useState(false);
  const [reason, setReason] = useState('');
  const [deleting, setDeleting] = useState(false);

  const startEdit = () => {
    setTitle(u.title);
    setText(u.text);
    setPhotos(u.photos);
    setEditing(true);
  };
  const saveEdit = () => {
    updateService.edit(u.id, { title: title.trim() || u.title, text, photos });
    setEditing(false);
    toast.success(t('portal.updates.saved'));
  };

  return (
    <li className={cn('card p-3', u.status === 'pending' && 'ring-1 ring-amber-400/60')}>
      <div className="flex flex-wrap items-center gap-2 text-xs text-slate-500">
        <Badge tone="slate">{t(`portal.kind.${u.kind}`)}</Badge>
        <span>{when(u.createdAt)}</span>
        <span>· {t('portal.updates.by', { name: updateAuthorName(u) })}</span>
        {u.minutes ? <span className="font-medium text-slate-700 dark:text-slate-200">· {formatMinutes(u.minutes)}</span> : null}
      </div>

      {editing ? (
        <div className="mt-2 space-y-2">
          {u.kind !== 'phase' && <Input value={title} onChange={(e) => setTitle(e.target.value)} aria-label={t('portal.updates.title')} />}
          <Textarea rows={3} value={text} onChange={(e) => setText(e.target.value)} aria-label={t('portal.updates.text')} placeholder={t('portal.updates.text')} />
          <PhotoPicker value={photos} onChange={setPhotos} max={MAX_UPDATE_PHOTOS} />
          <div className="flex justify-end gap-2">
            <Button size="sm" icon={X} onClick={() => setEditing(false)}>
              {t('common.cancel')}
            </Button>
            <Button size="sm" variant="primary" icon={Save} onClick={saveEdit}>
              {t('common.save')}
            </Button>
          </div>
        </div>
      ) : (
        <>
          <p className="mt-1 font-semibold text-slate-900 dark:text-white">{u.kind === 'phase' ? t('portal.view.phaseDone', { phase: u.title }) : u.title}</p>
          {u.text ? <p className="mt-1 text-sm whitespace-pre-line text-slate-700 dark:text-slate-200">{u.text}</p> : <p className="mt-1 text-xs text-slate-400 italic">{t('portal.updates.noText')}</p>}
          {u.photos.length > 0 && (
            <ul className="mt-2 flex flex-wrap gap-1.5">
              {u.photos.map((src, i) => (
                <li key={i}>
                  <img src={src} alt="" className="size-16 rounded-md bg-slate-100 object-cover dark:bg-slate-800" />
                </li>
              ))}
            </ul>
          )}
          {u.status === 'rejected' && u.reviewNote && <p className="mt-2 text-xs text-red-600">{t('portal.updates.rejectedReason', { reason: u.reviewNote })}</p>}
        </>
      )}

      {canReview && !editing && (
        <div className="mt-3 flex flex-wrap items-center gap-2 border-t border-slate-100 pt-2 dark:border-slate-800">
          {u.minutes ? (
            <button
              type="button"
              onClick={() => updateService.edit(u.id, { showHours: !u.showHours })}
              className={cn('inline-flex items-center gap-1 rounded-md px-2 py-1 text-xs font-medium', u.showHours ? 'bg-blue-50 text-blue-700 dark:bg-blue-500/10 dark:text-blue-300' : 'bg-slate-100 text-slate-500 dark:bg-slate-800')}
              title={t('portal.updates.hoursToggle')}
            >
              {u.showHours ? <Eye className="size-3.5" /> : <EyeOff className="size-3.5" />}
              {u.showHours ? t('portal.updates.hoursShown') : t('portal.updates.hoursHidden')}
            </button>
          ) : null}
          <span className="flex-1" />
          {u.status === 'pending' && !rejecting && (
            <>
              <Button size="sm" variant="ghost" icon={Pencil} onClick={startEdit}>
                {t('common.edit')}
              </Button>
              <Button size="sm" variant="ghost" icon={Ban} className="text-red-600" onClick={() => setRejecting(true)}>
                {t('portal.updates.reject')}
              </Button>
              <Button size="sm" variant="primary" icon={Check} onClick={() => { updateService.approve(u.id); toast.success(t('portal.updates.approved')); }}>
                {t('portal.updates.approve')}
              </Button>
            </>
          )}
          {u.status === 'approved' && (
            <Button size="sm" variant="ghost" icon={Undo2} onClick={() => updateService.unpublish(u.id)}>
              {t('portal.updates.unpublish')}
            </Button>
          )}
          {u.status === 'rejected' && (
            <>
              <Button size="sm" variant="ghost" icon={RotateCcw} onClick={() => updateService.unpublish(u.id)}>
                {t('portal.updates.backToReview')}
              </Button>
              <Button size="sm" variant="ghost" icon={Trash2} className="text-red-600" onClick={() => setDeleting(true)} aria-label={t('common.delete')} />
            </>
          )}
        </div>
      )}
      {rejecting && (
        <div className="mt-2 flex flex-wrap items-center gap-2">
          <div className="min-w-0 flex-1">
            <Input autoFocus value={reason} onChange={(e) => setReason(e.target.value)} placeholder={t('portal.updates.reason')} aria-label={t('portal.updates.reason')} />
          </div>
          <Button size="sm" variant="danger" icon={Ban} onClick={() => { updateService.reject(u.id, reason); setRejecting(false); setReason(''); }}>
            {t('portal.updates.reject')}
          </Button>
          <Button size="sm" variant="ghost" icon={X} onClick={() => setRejecting(false)} aria-label={t('common.cancel')} />
        </div>
      )}
      <ConfirmDialog
        open={deleting}
        title={t('portal.updates.deleteTitle')}
        message={t('portal.updates.deleteMessage')}
        confirmLabel={t('common.delete')}
        onCancel={() => setDeleting(false)}
        onConfirm={() => { updateService.remove(u.id); setDeleting(false); }}
      />
    </li>
  );
}
