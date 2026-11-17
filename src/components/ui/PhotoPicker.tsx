import { useRef, useState } from 'react';
import { Camera, ImagePlus, X } from 'lucide-react';
import { useI18n } from '@/i18n';
import { cn } from '@/lib/cn';
import { compressImage } from '@/lib/image';

/**
 * Várias fotos (câmera ou galeria), reduzidas para JPEG antes de guardar. Miniaturas com "remover".
 * `large` = botões grandes para o chão de fábrica.
 */
export function PhotoPicker({ value, onChange, max = 8, large = false, label }: { value: string[]; onChange: (v: string[]) => void; max?: number; large?: boolean; label?: string }) {
  const { t } = useI18n();
  const ref = useRef<HTMLInputElement>(null);
  const [busy, setBusy] = useState(false);

  const add = async (files: FileList | null) => {
    if (!files?.length) return;
    setBusy(true);
    const out = [...value];
    for (const f of Array.from(files)) {
      if (out.length >= max) break;
      try {
        out.push(await compressImage(f, 1280, 0.7));
      } catch {
        /* arquivo que não é imagem: ignora */
      }
    }
    onChange(out);
    setBusy(false);
    if (ref.current) ref.current.value = '';
  };

  return (
    <div className="space-y-2">
      <input ref={ref} type="file" accept="image/*" multiple className="hidden" onChange={(e) => void add(e.target.files)} />
      {value.length > 0 && (
        <ul className="grid grid-cols-3 gap-2 sm:grid-cols-4">
          {value.map((src, i) => (
            <li key={i} className="relative">
              <img src={src} alt="" className="aspect-square w-full rounded-lg bg-slate-100 object-cover dark:bg-slate-800" />
              <button
                type="button"
                onClick={() => onChange(value.filter((_, j) => j !== i))}
                className="absolute top-1 right-1 rounded-full bg-black/60 p-1 text-white"
                aria-label={t('photos.remove')}
              >
                <X className="size-3.5" />
              </button>
            </li>
          ))}
        </ul>
      )}
      {value.length < max && (
        <button
          type="button"
          disabled={busy}
          onClick={() => ref.current?.click()}
          className={cn(
            'flex w-full items-center justify-center gap-2 rounded-xl border-2 border-dashed border-slate-300 font-semibold text-slate-600 disabled:opacity-60 dark:border-slate-700 dark:text-slate-300',
            large ? 'py-4 text-base' : 'py-2.5 text-sm',
          )}
        >
          {large ? <Camera className="size-5" /> : <ImagePlus className="size-4" />}
          {busy ? t('photos.processing') : (label ?? t('photos.add'))} <span className="font-normal text-slate-400">({value.length}/{max})</span>
        </button>
      )}
    </div>
  );
}
