import logoDark from '@/assets/weiss-logo.png';
import logoWhite from '@/assets/weiss-logo-white.png';
import { cn } from '@/lib/cn';

/**
 * Logo Weiss. `onDark` = letras brancas (barra lateral, login, ponto, TV); senão letras pretas.
 * O W vermelho desce abaixo das letras, por isso a imagem é mais alta que o texto.
 */
export function BrandLogo({ onDark = true, className }: { onDark?: boolean; className?: string }) {
  return <img src={onDark ? logoWhite : logoDark} alt="Weiss" className={cn('max-w-none select-none', className)} draggable={false} />;
}
