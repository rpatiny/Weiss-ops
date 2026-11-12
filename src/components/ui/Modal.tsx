import type { ReactNode } from 'react';
import { createPortal } from 'react-dom';
import { AlertTriangle } from 'lucide-react';
import { Button } from './Button';
import { useEscape } from './Drawer';
import { useI18n } from '@/i18n';

interface ModalProps {
  open: boolean;
  onClose: () => void;
  title: ReactNode;
  children: ReactNode;
  footer?: ReactNode;
}

export function Modal({ open, onClose, title, children, footer }: ModalProps) {
  useEscape(open, onClose);
  if (!open) return null;
  return createPortal(
    <div className="fixed inset-0 z-[60] flex items-center justify-center p-4" role="dialog" aria-modal="true" onSubmit={(e) => e.stopPropagation()} onClick={(e) => e.stopPropagation()} onPointerDown={(e) => e.stopPropagation()}>
      <div className="animate-fade-in absolute inset-0 bg-slate-950/50" onClick={onClose} />
      <div className="animate-pop-in card relative w-full max-w-md p-5 shadow-2xl">
        <h2 className="text-base font-semibold text-slate-900 dark:text-white">{title}</h2>
        <div className="mt-2 text-sm text-slate-600 dark:text-slate-400">{children}</div>
        {footer && <div className="mt-5 flex justify-end gap-2">{footer}</div>}
      </div>
    </div>,
    document.body,
  );
}

interface ConfirmProps {
  open: boolean;
  title: string;
  message: ReactNode;
  confirmLabel?: string;
  danger?: boolean;
  onConfirm: () => void;
  onCancel: () => void;
}

export function ConfirmDialog({ open, title, message, confirmLabel, danger = true, onConfirm, onCancel }: ConfirmProps) {
  const { t } = useI18n();
  return (
    <Modal
      open={open}
      onClose={onCancel}
      title={
        <span className="flex items-center gap-2">
          {danger && <AlertTriangle className="size-5 text-red-500" />}
          {title}
        </span>
      }
      footer={
        <>
          <Button onClick={onCancel}>{t('common.cancel')}</Button>
          <Button variant={danger ? 'danger' : 'primary'} onClick={onConfirm}>
            {confirmLabel ?? t('common.confirm')}
          </Button>
        </>
      }
    >
      {message}
    </Modal>
  );
}
