import { forwardRef, type ButtonHTMLAttributes, type ReactNode } from 'react';
import type { LucideIcon } from 'lucide-react';
import { cn } from '@/lib/cn';

type Variant = 'primary' | 'secondary' | 'ghost' | 'danger';
type Size = 'sm' | 'md';

export interface ButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: Variant;
  size?: Size;
  icon?: LucideIcon;
  children?: ReactNode;
}

const variants: Record<Variant, string> = {
  primary: 'bg-brand-500 text-slate-950 hover:bg-brand-400 shadow-sm font-semibold',
  secondary:
    'border border-slate-300 bg-white text-slate-700 hover:bg-slate-50 shadow-sm dark:border-slate-700 dark:bg-slate-800 dark:text-slate-200 dark:hover:bg-slate-700',
  ghost: 'text-slate-600 hover:bg-slate-100 dark:text-slate-300 dark:hover:bg-slate-800',
  danger: 'bg-red-600 text-white hover:bg-red-500 shadow-sm',
};

const sizes: Record<Size, string> = {
  sm: 'h-8 text-xs gap-1.5',
  md: 'h-9 text-sm gap-2',
};
const paddings: Record<Size, string> = { sm: 'px-2.5', md: 'px-3.5' };
const iconOnly: Record<Size, string> = { sm: 'w-8', md: 'w-9' };

export const Button = forwardRef<HTMLButtonElement, ButtonProps>(function Button(
  { variant = 'secondary', size = 'md', icon: Icon, className, children, type = 'button', ...rest },
  ref,
) {
  return (
    <button
      ref={ref}
      type={type}
      className={cn(
        'inline-flex shrink-0 items-center justify-center rounded-lg font-medium whitespace-nowrap transition-colors',
        'focus-visible:ring-2 focus-visible:ring-brand-500/50 focus-visible:outline-none disabled:pointer-events-none disabled:opacity-50',
        variants[variant],
        sizes[size],
        children ? paddings[size] : iconOnly[size],
        className,
      )}
      {...rest}
    >
      {Icon && <Icon className={size === 'sm' ? 'size-3.5' : 'size-4'} aria-hidden />}
      {children}
    </button>
  );
});
