import { useEffect, useRef, useState } from 'react';
import { ArrowLeft, ArrowRight, Camera, CheckCircle2, RotateCcw, Send } from 'lucide-react';
import { DisclaimerStrip } from '@/components/layout/Disclaimer';
import { BrandLogo } from '@/components/layout/BrandLogo';
import { useCollection } from '@/data/hooks';
import { SHOPFLOOR_FIELDS, shopfloorService, validateShopfloorField, type ShopfloorField, type ShopfloorInput } from '@/domain/shopfloor';
import { canClock } from '@/domain/timeTracking';
import { LOCALES, useI18n } from '@/i18n';
import { cn } from '@/lib/cn';
import { compressImage } from '@/lib/image';
import type { Employee, ShopfloorRequest } from '@/types/models';
import { BackBtn, PinStep, WhoStep } from '@/modules/clock/ClockPage';

type Step = { kind: 'field'; index: number } | { kind: 'review' } | { kind: 'who' } | { kind: 'pin'; employee: Employee } | { kind: 'done'; request: ShopfloorRequest };

const EMPTY: ShopfloorInput = { photo: '', description: '', quantity: 0, supplier: '', supplierCode: '' };
const INACTIVITY_MS = 3 * 60_000;
const DONE_SECONDS = 8;

/**
 * Pedido de compra do shop floor (aberto pelo QR code, no celular, sem login no app):
 * foto → descrição → quantidade → fornecedor → código do fornecedor (todos obrigatórios) → revisão → nome + PIN do ponto → enviado.
 */
export function ShopRequestPage() {
  const { t, locale, setLocale } = useI18n();
  const employees = useCollection('employees');
  const [step, setStep] = useState<Step>({ kind: 'field', index: 0 });
  const [data, setData] = useState<ShopfloorInput>(EMPTY);
  const [error, setError] = useState<string>();
  const lastAction = useRef(Date.now());

  const restart = () => {
    setData(EMPTY);
    setError(undefined);
    setStep({ kind: 'field', index: 0 });
  };

  // Celular esquecido aberto: depois de 3 min sem uso, descarta o rascunho.
  useEffect(() => {
    const bump = () => (lastAction.current = Date.now());
    window.addEventListener('pointerdown', bump);
    window.addEventListener('keydown', bump);
    const timer = setInterval(() => {
      if (Date.now() - lastAction.current > INACTIVITY_MS) restart();
    }, 10_000);
    return () => {
      window.removeEventListener('pointerdown', bump);
      window.removeEventListener('keydown', bump);
      clearInterval(timer);
    };
  }, []);

  const clockable = employees.filter(canClock).sort((a, b) => a.name.localeCompare(b.name));
  const submit = (employee: Employee, pin: string) => {
    const r = shopfloorService.create(employee.id, pin, data);
    if (!r.ok) {
      setError(t(r.error));
      setStep({ kind: 'review' });
      return;
    }
    setStep({ kind: 'done', request: r.request });
  };

  return (
    <div className="flex min-h-dvh flex-col bg-slate-100 dark:bg-slate-950">
      <DisclaimerStrip />
      <header className="flex items-center justify-between gap-3 bg-slate-900 px-4 py-3 text-white">
        <div className="flex items-center gap-2.5">
          <BrandLogo className="w-20" />
          <p className="border-l border-slate-700 pl-2.5 font-bold leading-tight">{t('shopfloor.title')}</p>
        </div>
        <div className="flex gap-0.5">
          {LOCALES.map((l) => (
            <button key={l.value} onClick={() => setLocale(l.value)} className={cn('rounded-md px-2 py-1 text-xs font-semibold', locale === l.value ? 'bg-slate-700 text-white' : 'text-slate-400')}>
              {l.short}
            </button>
          ))}
        </div>
      </header>

      <main className="mx-auto w-full max-w-md min-w-0 flex-1 px-4 py-5">
        {step.kind === 'field' && (
          <FieldStep
            field={SHOPFLOOR_FIELDS[step.index]!}
            index={step.index}
            data={data}
            onChange={(patch) => setData((d) => ({ ...d, ...patch }))}
            onBack={step.index > 0 ? () => setStep({ kind: 'field', index: step.index - 1 }) : undefined}
            onNext={() => setStep(step.index + 1 < SHOPFLOOR_FIELDS.length ? { kind: 'field', index: step.index + 1 } : { kind: 'review' })}
          />
        )}
        {step.kind === 'review' && (
          <ReviewStep data={data} error={error} onEdit={(i) => setStep({ kind: 'field', index: i })} onSend={() => { setError(undefined); setStep({ kind: 'who' }); }} />
        )}
        {step.kind === 'who' && (
          <>
            <BackBtn onClick={() => setStep({ kind: 'review' })} />
            <WhoStep employees={clockable} onPick={(employee) => setStep({ kind: 'pin', employee })} />
          </>
        )}
        {step.kind === 'pin' && <PinStep employee={step.employee} onBack={() => setStep({ kind: 'who' })} onOk={(pin) => submit(step.employee, pin)} />}
        {step.kind === 'done' && <DoneStep request={step.request} onNew={restart} />}
      </main>
    </div>
  );
}

function Progress({ index }: { index: number }) {
  const { t } = useI18n();
  return (
    <div className="mb-4">
      <p className="mb-1.5 text-xs font-semibold tracking-wide text-slate-500 uppercase">{t('shopfloor.stepOf', { n: index + 1, total: SHOPFLOOR_FIELDS.length })}</p>
      <div className="flex gap-1.5">
        {SHOPFLOOR_FIELDS.map((f, i) => (
          <span key={f} className={cn('h-1.5 flex-1 rounded-full', i <= index ? 'bg-brand-500' : 'bg-slate-300 dark:bg-slate-700')} />
        ))}
      </div>
    </div>
  );
}

function FieldStep({
  field,
  index,
  data,
  onChange,
  onBack,
  onNext,
}: {
  field: ShopfloorField;
  index: number;
  data: ShopfloorInput;
  onChange: (patch: Partial<ShopfloorInput>) => void;
  onBack?: () => void;
  onNext: () => void;
}) {
  const { t } = useI18n();
  const suppliers = useCollection('suppliers');
  const [touched, setTouched] = useState(false);
  const [busy, setBusy] = useState(false);
  const fileRef = useRef<HTMLInputElement>(null);
  useEffect(() => setTouched(false), [field]);
  const err = validateShopfloorField(field, data);

  const next = () => {
    setTouched(true);
    if (!err) onNext();
  };

  const onPhoto = async (file: File | undefined) => {
    if (!file) return;
    setBusy(true);
    try {
      onChange({ photo: await compressImage(file) });
    } catch {
      onChange({ photo: '' });
    } finally {
      setBusy(false);
    }
  };

  const inputCls = 'input py-3 text-lg';
  return (
    <form
      onSubmit={(e) => {
        e.preventDefault();
        next();
      }}
      noValidate
    >
      {onBack ? (
        <button type="button" onClick={onBack} className="mb-4 flex items-center gap-1 text-sm font-medium text-slate-600 dark:text-slate-300">
          <ArrowLeft className="size-4" /> {t('clock.back')}
        </button>
      ) : null}
      <Progress index={index} />
      <h1 className="mb-1 text-xl font-bold text-slate-900 dark:text-white">{t(`shopfloor.fields.${field}`)}</h1>
      <p className="mb-4 text-sm text-slate-500">{t(`shopfloor.hints.${field}`)}</p>

      {field === 'photo' && (
        <div className="space-y-3">
          <input ref={fileRef} type="file" accept="image/*" capture="environment" className="hidden" onChange={(e) => void onPhoto(e.target.files?.[0])} />
          {data.photo ? (
            <>
              <img src={data.photo} alt={t('shopfloor.fields.photo')} className="max-h-[50vh] w-full rounded-xl object-contain shadow-sm ring-1 ring-slate-200 dark:ring-slate-800" />
              <button type="button" onClick={() => fileRef.current?.click()} className="flex w-full items-center justify-center gap-2 rounded-xl bg-white py-3 font-semibold text-slate-700 shadow-sm dark:bg-slate-800 dark:text-slate-200">
                <RotateCcw className="size-5" /> {t('shopfloor.retake')}
              </button>
            </>
          ) : (
            <button
              type="button"
              disabled={busy}
              onClick={() => fileRef.current?.click()}
              className="flex aspect-[4/3] w-full flex-col items-center justify-center gap-3 rounded-xl border-2 border-dashed border-slate-300 bg-white text-slate-600 active:scale-[0.99] disabled:opacity-60 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-300"
            >
              <Camera className="size-12" />
              <span className="text-lg font-semibold">{busy ? t('shopfloor.processing') : t('shopfloor.takePhoto')}</span>
            </button>
          )}
        </div>
      )}
      {field === 'description' && (
        <textarea autoFocus rows={4} className={cn(inputCls, 'min-h-28')} value={data.description} onChange={(e) => onChange({ description: e.target.value })} aria-label={t('shopfloor.fields.description')} />
      )}
      {field === 'quantity' && (
        <input
          autoFocus
          type="number"
          inputMode="numeric"
          min={1}
          step={1}
          className={cn(inputCls, 'text-center text-3xl font-bold tabular-nums')}
          value={data.quantity || ''}
          onChange={(e) => onChange({ quantity: Math.floor(Number(e.target.value)) || 0 })}
          aria-label={t('shopfloor.fields.quantity')}
        />
      )}
      {field === 'supplier' && (
        <>
          <input autoFocus className={inputCls} list="sf-suppliers" autoComplete="off" value={data.supplier} onChange={(e) => onChange({ supplier: e.target.value })} aria-label={t('shopfloor.fields.supplier')} />
          <datalist id="sf-suppliers">
            {suppliers.map((s) => (
              <option key={s.id} value={s.name} />
            ))}
          </datalist>
        </>
      )}
      {field === 'supplierCode' && (
        <input autoFocus className={cn(inputCls, 'font-mono')} autoComplete="off" autoCapitalize="characters" value={data.supplierCode} onChange={(e) => onChange({ supplierCode: e.target.value })} aria-label={t('shopfloor.fields.supplierCode')} />
      )}

      <p className={cn('mt-2 min-h-5 text-sm font-medium text-red-600')} role={touched && err ? 'alert' : undefined}>
        {touched && err ? t(err) : ''}
      </p>
      <button type="submit" disabled={busy} className="mt-2 flex w-full items-center justify-center gap-2 rounded-xl bg-neutral-900 py-4 text-lg font-semibold text-white active:scale-[0.99] disabled:opacity-50 dark:bg-white dark:text-neutral-900">
        {t('shopfloor.next')} <ArrowRight className="size-5" />
      </button>
    </form>
  );
}

function ReviewStep({ data, error, onEdit, onSend }: { data: ShopfloorInput; error?: string; onEdit: (index: number) => void; onSend: () => void }) {
  const { t } = useI18n();
  const rows: [ShopfloorField, string][] = [
    ['description', data.description],
    ['quantity', String(data.quantity)],
    ['supplier', data.supplier],
    ['supplierCode', data.supplierCode],
  ];
  return (
    <>
      <h1 className="mb-1 text-xl font-bold text-slate-900 dark:text-white">{t('shopfloor.reviewTitle')}</h1>
      <p className="mb-4 text-sm text-slate-500">{t('shopfloor.reviewHint')}</p>
      <div className="card overflow-hidden">
        <button type="button" onClick={() => onEdit(0)} className="block w-full" aria-label={t('shopfloor.fields.photo')}>
          <img src={data.photo} alt="" className="max-h-64 w-full bg-slate-50 object-contain dark:bg-slate-900" />
        </button>
        <dl className="divide-y divide-slate-100 dark:divide-slate-800">
          {rows.map(([f, v]) => (
            <button key={f} type="button" onClick={() => onEdit(SHOPFLOOR_FIELDS.indexOf(f))} className="flex w-full items-start justify-between gap-3 px-4 py-3 text-left">
              <span className="min-w-0">
                <dt className="text-xs font-semibold tracking-wide text-slate-500 uppercase">{t(`shopfloor.fields.${f}`)}</dt>
                <dd className={cn('break-words text-base text-slate-900 dark:text-white', f === 'supplierCode' && 'font-mono')}>{v}</dd>
              </span>
              <span className="shrink-0 text-sm font-medium text-brand-700 dark:text-brand-400">{t('common.edit')}</span>
            </button>
          ))}
        </dl>
      </div>
      {error && (
        <p role="alert" className="mt-3 text-sm font-medium text-red-600">
          {error}
        </p>
      )}
      <button type="button" onClick={onSend} className="mt-4 flex w-full items-center justify-center gap-2 rounded-xl bg-neutral-900 py-4 text-lg font-semibold text-white active:scale-[0.99] dark:bg-white dark:text-neutral-900">
        <Send className="size-5" /> {t('shopfloor.send')}
      </button>
      <p className="mt-2 text-center text-xs text-slate-500">{t('shopfloor.sendHint')}</p>
    </>
  );
}

function DoneStep({ request, onNew }: { request: ShopfloorRequest; onNew: () => void }) {
  const { t } = useI18n();
  const [left, setLeft] = useState(DONE_SECONDS);
  useEffect(() => {
    const timer = setInterval(() => setLeft((s) => s - 1), 1000);
    return () => clearInterval(timer);
  }, []);
  useEffect(() => {
    if (left <= 0) onNew();
  }, [left, onNew]);
  return (
    <div className="card mt-6 flex flex-col items-center gap-3 p-8 text-center">
      <CheckCircle2 className="size-14 text-green-600" />
      <p className="text-xl font-bold text-slate-900 dark:text-white">{t('shopfloor.doneTitle')}</p>
      <p className="font-mono text-lg font-semibold text-slate-700 dark:text-slate-200">{request.number}</p>
      <p className="text-sm text-slate-500">{t('shopfloor.doneText')}</p>
      <button onClick={onNew} className="mt-2 rounded-xl bg-neutral-900 px-5 py-3 font-semibold text-white dark:bg-white dark:text-neutral-900">
        {t('shopfloor.newRequest')} · {Math.max(0, left)}
      </button>
    </div>
  );
}
