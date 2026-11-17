import { useEffect, useRef, useState, type InputHTMLAttributes } from 'react';
import { Lock, Pencil } from 'lucide-react';
import { useI18n } from '@/i18n';
import { cn } from '@/lib/cn';
import { Button } from './Button';
import { Input } from './Field';
import { ConfirmDialog } from './Modal';

type Props = InputHTMLAttributes<HTMLInputElement> & {
  invalid?: boolean;
  /** Trava o campo (registro já salvo). Em registros novos passe false: o campo fica livre. */
  protect: boolean;
  /** Nome do campo mostrado na confirmação ("Edit serial number?"). */
  fieldLabel: string;
  /** Muda quando o formulário é reaberto/outro registro é carregado ⇒ volta a travar. */
  resetKey?: unknown;
};

/**
 * Campo de dado-chave (nº de série, cliente, nº do projeto): em registros salvos fica travado com cadeado;
 * o botão "Edit" pede confirmação ("Are you sure?") antes de liberar a edição.
 */
export function ProtectedInput({ protect, fieldLabel, resetKey, className, ...rest }: Props) {
  const { t } = useI18n();
  const [unlocked, setUnlocked] = useState(false);
  const [asking, setAsking] = useState(false);
  const ref = useRef<HTMLInputElement>(null);
  useEffect(() => setUnlocked(false), [protect, resetKey]);

  const locked = protect && !unlocked;
  return (
    <div className="flex gap-2">
      <div className="relative min-w-0 flex-1">
        <Input
          {...rest}
          ref={ref}
          readOnly={locked || rest.readOnly}
          aria-readonly={locked || undefined}
          className={cn(className, locked && 'cursor-default bg-slate-50 pr-9 text-slate-700 focus:border-slate-300 focus:ring-0 dark:bg-slate-800/60 dark:text-slate-200 dark:focus:border-slate-700')}
        />
        {locked && <Lock className="pointer-events-none absolute top-1/2 right-3 size-4 -translate-y-1/2 text-slate-400" aria-hidden />}
      </div>
      {locked && (
        <Button icon={Pencil} onClick={() => setAsking(true)} aria-label={t('protected.editAria', { field: fieldLabel })}>
          {t('common.edit')}
        </Button>
      )}
      <ConfirmDialog
        open={asking}
        danger={false}
        title={t('protected.title', { field: fieldLabel })}
        message={t('protected.message', { field: fieldLabel })}
        confirmLabel={t('protected.confirm')}
        onCancel={() => setAsking(false)}
        onConfirm={() => {
          setAsking(false);
          setUnlocked(true);
          setTimeout(() => {
            ref.current?.focus();
            ref.current?.select();
          }, 0);
        }}
      />
    </div>
  );
}
