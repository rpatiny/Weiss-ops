import { useEffect, useState } from 'react';
import { ShieldAlert } from 'lucide-react';
import { useI18n } from '@/i18n';
import { Button } from './Button';
import { Input } from './Field';
import { Modal } from './Modal';

/**
 * Tela de segurança no estilo do GitHub ("digite o nome do repositório para confirmar"): a ação só é liberada quando a
 * pessoa digita exatamente a frase mostrada. Usada para alterações manuais sensíveis (ex.: horas lançadas à mão).
 */
export function TypeToConfirm({
  open,
  title,
  message,
  phrase,
  confirmLabel,
  danger = true,
  onConfirm,
  onCancel,
}: {
  open: boolean;
  title: string;
  message: string;
  /** Frase que precisa ser digitada (comparação exata, sem diferenciar maiúsculas). */
  phrase: string;
  confirmLabel: string;
  danger?: boolean;
  onConfirm: () => void;
  onCancel: () => void;
}) {
  const { t } = useI18n();
  const [typed, setTyped] = useState('');
  useEffect(() => {
    if (open) setTyped('');
  }, [open]);
  const ok = typed.trim().toLowerCase() === phrase.trim().toLowerCase();

  return (
    <Modal
      open={open}
      onClose={onCancel}
      title={
        <span className="flex items-center gap-2">
          <ShieldAlert className="size-5 text-red-500" /> {title}
        </span>
      }
      footer={
        <>
          <Button onClick={onCancel}>{t('common.cancel')}</Button>
          <Button variant={danger ? 'danger' : 'primary'} disabled={!ok} onClick={onConfirm}>
            {confirmLabel}
          </Button>
        </>
      }
    >
      <form
        onSubmit={(e) => {
          e.preventDefault();
          if (ok) onConfirm();
        }}
        className="space-y-3"
      >
        <p className="text-sm text-slate-600 dark:text-slate-300">{message}</p>
        <p className="text-sm text-slate-700 dark:text-slate-200">
          {t('typeConfirm.typeThis')}{' '}
          <code className="rounded bg-slate-100 px-1.5 py-0.5 font-mono font-semibold text-slate-900 select-all dark:bg-slate-800 dark:text-white">{phrase}</code>
        </p>
        <Input autoFocus autoComplete="off" autoCapitalize="none" spellCheck={false} className="font-mono" value={typed} onChange={(e) => setTyped(e.target.value)} aria-label={t('typeConfirm.typeThis')} invalid={typed.length > 0 && !ok} />
      </form>
    </Modal>
  );
}
