import { useState } from 'react';
import { Plus, X } from 'lucide-react';
import { Button } from '@/components/ui/Button';
import { Input, Select } from '@/components/ui/Field';
import { useCollection } from '@/data/hooks';
import { ensureSupplier, type ItemSupplierInput } from '@/domain/requisitions';
import { useI18n } from '@/i18n';
import { cn } from '@/lib/cn';
import { APP_CONFIG } from '@/lib/config';

/**
 * Fornecedores de um item do pedido (pelo menos um): busca no cadastro ou fornecedor novo (nome + e-mail).
 * "Já tenho cotação": o Office informa preço/prazo — o pedido chega à Logística pronto para a PO.
 */
export function ItemSuppliersPicker({ value, onChange, error }: { value: ItemSupplierInput; onChange: (v: ItemSupplierInput) => void; error?: boolean }) {
  const { t } = useI18n();
  const suppliers = useCollection('suppliers');
  const [query, setQuery] = useState('');
  const [email, setEmail] = useState('');
  const [hasQuote, setHasQuote] = useState(!!value.quote);
  const name = (id: string) => suppliers.find((s) => s.id === id)?.name ?? id;
  const typed = query.trim();
  const existing = suppliers.find((s) => s.name.trim().toLowerCase() === typed.toLowerCase());
  const isNew = !!typed && !existing;

  const add = () => {
    if (!typed) return;
    if (isNew && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email.trim())) return;
    const id = existing?.id ?? ensureSupplier(typed, email);
    if (!value.supplierIds.includes(id)) onChange({ ...value, supplierIds: [...value.supplierIds, id] });
    setQuery('');
    setEmail('');
  };
  const remove = (id: string) => onChange({ ...value, supplierIds: value.supplierIds.filter((x) => x !== id), quote: value.quote?.supplierId === id ? undefined : value.quote });

  return (
    <div className={cn('space-y-2 rounded-lg bg-slate-50 p-3 dark:bg-slate-800/50', error && 'ring-2 ring-red-400')}>
      <p className="text-xs font-semibold tracking-wide text-slate-500 uppercase">{t('process.form.suppliers')}</p>
      <div className="flex flex-wrap gap-1.5">
        {value.supplierIds.length === 0 && <span className="text-sm text-red-600">{t('process.form.atLeastOne')}</span>}
        {value.supplierIds.map((id) => (
          <span key={id} className="inline-flex items-center gap-1 rounded-full bg-white py-1 pr-1 pl-3 text-sm shadow-sm ring-1 ring-slate-200 dark:bg-slate-900 dark:ring-slate-700">
            {name(id)}
            <button type="button" onClick={() => remove(id)} className="rounded-full p-0.5 text-slate-400 hover:bg-slate-100 hover:text-slate-700 dark:hover:bg-slate-800" aria-label={t('common.delete')}>
              <X className="size-3.5" />
            </button>
          </span>
        ))}
      </div>
      <div className="flex flex-wrap items-start gap-2">
        <div className="min-w-[12rem] flex-1">
          <Input
            list="req-supplier-list"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter') {
                e.preventDefault();
                add();
              }
            }}
            placeholder={t('process.form.searchSupplier')}
            aria-label={t('process.form.searchSupplier')}
          />
          <datalist id="req-supplier-list">
            {suppliers.map((s) => (
              <option key={s.id} value={s.name}>
                {s.email}
              </option>
            ))}
          </datalist>
        </div>
        {isNew && (
          <div className="min-w-[12rem] flex-1">
            <Input type="email" value={email} onChange={(e) => setEmail(e.target.value)} placeholder={t('process.form.newSupplierEmail')} aria-label={t('process.form.newSupplierEmail')} />
          </div>
        )}
        <Button icon={Plus} onClick={add} disabled={!typed || (isNew && !email.trim())}>
          {isNew ? t('process.form.addNewSupplier') : t('common.add')}
        </Button>
      </div>
      {isNew && <p className="text-xs text-slate-500">{t('process.form.newSupplierHint', { name: typed })}</p>}

      {value.supplierIds.length > 0 && (
        <div className="border-t border-slate-200 pt-2 dark:border-slate-700">
          <label className="flex items-center gap-2 text-sm">
            <input
              type="checkbox"
              className="size-4 accent-neutral-900"
              checked={hasQuote}
              onChange={(e) => {
                setHasQuote(e.target.checked);
                onChange({ ...value, quote: e.target.checked ? { supplierId: value.supplierIds[0]!, price: 0 } : undefined });
              }}
            />
            {t('process.form.haveQuote')}
          </label>
          {hasQuote && value.quote && (
            <div className="mt-2 grid gap-2 sm:grid-cols-4">
              <Select
                value={value.quote.supplierId}
                onChange={(v) => onChange({ ...value, quote: { ...value.quote!, supplierId: v } })}
                options={value.supplierIds.map((id) => ({ value: id, label: name(id) }))}
                aria-label={t('process.form.quoteSupplier')}
              />
              <Input
                type="number"
                min={0}
                step="0.01"
                value={value.quote.price || ''}
                onChange={(e) => onChange({ ...value, quote: { ...value.quote!, price: Number(e.target.value) || 0 } })}
                placeholder={t('process.form.unitPrice', { currency: APP_CONFIG.currency })}
                aria-label={t('process.form.unitPrice', { currency: APP_CONFIG.currency })}
              />
              <Input
                type="number"
                min={0}
                value={value.quote.leadTimeDays ?? ''}
                onChange={(e) => onChange({ ...value, quote: { ...value.quote!, leadTimeDays: e.target.value === '' ? undefined : Number(e.target.value) } })}
                placeholder={t('process.form.leadTime')}
                aria-label={t('process.form.leadTime')}
              />
              <Input value={value.quote.quoteRef ?? ''} onChange={(e) => onChange({ ...value, quote: { ...value.quote!, quoteRef: e.target.value } })} placeholder={t('process.form.quoteRef')} aria-label={t('process.form.quoteRef')} />
            </div>
          )}
        </div>
      )}
    </div>
  );
}
