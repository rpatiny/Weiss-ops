import { useEffect, useState, type FormEvent } from 'react';
import { Mail, Phone, Plus, Save, Trash2, Truck } from 'lucide-react';
import { Button } from '@/components/ui/Button';
import { Drawer } from '@/components/ui/Drawer';
import { Field, Input, Textarea } from '@/components/ui/Field';
import { ConfirmDialog } from '@/components/ui/Modal';
import { EmptyState } from '@/components/ui/misc';
import { useToast } from '@/components/ui/Toast';
import { isPOActive, supplierService, type SupplierDraft } from '@/domain/purchasing';
import { useI18n } from '@/i18n';
import { formatDate } from '@/lib/format';
import { usePurchasingData } from './usePurchasingData';

const empty = (): SupplierDraft => ({ name: '', contactName: '', email: '', phone: '', notes: '' });

export function SuppliersTab() {
  const { t } = useI18n();
  const pd = usePurchasingData();
  const [editing, setEditing] = useState<{ id?: string } | null>(null);

  const stats = (id: string) => {
    const pos = pd.purchaseOrders.filter((p) => p.supplierId === id);
    return {
      materials: pd.catalog.filter((m) => m.offers.some((o) => o.supplierId === id)).length,
      open: pos.filter(isPOActive).length,
      last: pos.map((p) => p.orderDate).sort().at(-1),
    };
  };

  return (
    <div className="card overflow-hidden">
      <div className="flex justify-end border-b border-slate-200 p-4 dark:border-slate-800">
        <Button variant="primary" icon={Plus} onClick={() => setEditing({})}>
          {t('purchasing.suppliers.new')}
        </Button>
      </div>
      {pd.suppliers.length === 0 ? (
        <EmptyState icon={Truck} title={t('purchasing.suppliers.empty')} />
      ) : (
        <div className="overflow-x-auto">
          <table className="w-full">
            <thead className="bg-slate-50 dark:bg-slate-800/50">
              <tr>
                <th className="th">{t('purchasing.suppliers.supplier')}</th>
                <th className="th hidden md:table-cell">{t('purchasing.suppliers.contact')}</th>
                <th className="th text-center">{t('purchasing.suppliers.materialsCount')}</th>
                <th className="th text-center">{t('purchasing.suppliers.openPOs')}</th>
                <th className="th hidden sm:table-cell">{t('purchasing.suppliers.lastOrder')}</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100 dark:divide-slate-800">
              {[...pd.suppliers]
                .sort((a, b) => a.name.localeCompare(b.name))
                .map((s) => {
                  const st = stats(s.id);
                  return (
                    <tr key={s.id} onClick={() => setEditing({ id: s.id })} className="cursor-pointer hover:bg-slate-50 dark:hover:bg-slate-800/40">
                      <td className="td">
                        <p className="font-medium text-slate-900 dark:text-white">{s.name}</p>
                        {s.notes && <p className="text-xs text-slate-500">{s.notes}</p>}
                      </td>
                      <td className="td hidden text-xs md:table-cell">
                        <p>{s.contactName}</p>
                        {s.email && (
                          <p className="flex items-center gap-1 text-slate-500">
                            <Mail className="size-3" /> {s.email}
                          </p>
                        )}
                        {s.phone && (
                          <p className="flex items-center gap-1 text-slate-500">
                            <Phone className="size-3" /> {s.phone}
                          </p>
                        )}
                      </td>
                      <td className="td text-center tabular-nums">{st.materials}</td>
                      <td className="td text-center tabular-nums">{st.open}</td>
                      <td className="td hidden text-sm sm:table-cell">{formatDate(st.last)}</td>
                    </tr>
                  );
                })}
            </tbody>
          </table>
        </div>
      )}
      <SupplierDrawer open={!!editing} supplierId={editing?.id} onClose={() => setEditing(null)} />
    </div>
  );
}

function SupplierDrawer({ open, supplierId, onClose }: { open: boolean; supplierId?: string; onClose: () => void }) {
  const { t } = useI18n();
  const toast = useToast();
  const pd = usePurchasingData();
  const existing = pd.suppliers.find((s) => s.id === supplierId);
  const [draft, setDraft] = useState<SupplierDraft>(empty());
  const [error, setError] = useState(false);
  const [confirm, setConfirm] = useState(false);

  useEffect(() => {
    if (!open) return;
    setError(false);
    if (existing) {
      const { id: _id, ...rest } = existing;
      setDraft(rest);
    } else setDraft(empty());
  }, [open, supplierId]);

  const submit = (e: FormEvent) => {
    e.preventDefault();
    if (!draft.name.trim()) return setError(true);
    supplierService.save(draft, supplierId);
    toast.success(t('purchasing.suppliers.saved'));
    onClose();
  };

  const set = (k: keyof SupplierDraft, v: string) => setDraft({ ...draft, [k]: v });

  return (
    <>
      <Drawer
        open={open}
        onClose={onClose}
        title={existing ? t('purchasing.suppliers.editTitle') : t('purchasing.suppliers.newTitle')}
        subtitle={existing?.name}
        footer={
          <>
            {existing && (
              <Button variant="ghost" icon={Trash2} className="mr-auto text-red-600" onClick={() => setConfirm(true)}>
                {t('common.delete')}
              </Button>
            )}
            <Button onClick={onClose}>{t('common.cancel')}</Button>
            <Button variant="primary" icon={Save} type="submit" form="supplier-form">
              {t('common.save')}
            </Button>
          </>
        }
      >
        <form id="supplier-form" onSubmit={submit} className="space-y-4" noValidate>
          <Field label={t('purchasing.suppliers.name')} required error={error ? t('purchasing.validation.nameRequired') : undefined}>
            {(id) => <Input id={id} name="supplierName" value={draft.name} onChange={(e) => set('name', e.target.value)} invalid={error} autoFocus />}
          </Field>
          <Field label={t('purchasing.suppliers.contactName')}>
            {(id) => <Input id={id} value={draft.contactName} onChange={(e) => set('contactName', e.target.value)} />}
          </Field>
          <div className="grid gap-4 sm:grid-cols-2">
            <Field label={t('purchasing.suppliers.email')}>
              {(id) => <Input id={id} type="email" value={draft.email} onChange={(e) => set('email', e.target.value)} />}
            </Field>
            <Field label={t('purchasing.suppliers.phone')}>
              {(id) => <Input id={id} type="tel" value={draft.phone} onChange={(e) => set('phone', e.target.value)} />}
            </Field>
          </div>
          <Field label={t('purchasing.suppliers.notes')}>
            {(id) => <Textarea id={id} rows={3} value={draft.notes} onChange={(e) => set('notes', e.target.value)} />}
          </Field>
        </form>
      </Drawer>
      <ConfirmDialog
        open={confirm}
        title={t('purchasing.suppliers.deleteTitle')}
        message={t('purchasing.suppliers.deleteMessage', { name: existing?.name ?? '' })}
        confirmLabel={t('common.delete')}
        onConfirm={() => {
          if (supplierId) supplierService.remove(supplierId);
          toast.success(t('purchasing.suppliers.deleted'));
          setConfirm(false);
          onClose();
        }}
        onCancel={() => setConfirm(false)}
      />
    </>
  );
}
