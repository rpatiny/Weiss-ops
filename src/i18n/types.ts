import type { pt } from './pt';

/** Mesma forma do dicionário pt, mas com `string` em cada folha. */
type Widen<T> = { [K in keyof T]: T[K] extends string ? string : Widen<T[K]> };
export type Dictionary = Widen<typeof pt>;

/** União de todas as chaves pontuadas: 'common.save' | 'employees.toast.created' | … */
type Paths<T, P extends string = ''> = {
  [K in keyof T & string]: T[K] extends string ? `${P}${K}` : Paths<T[K], `${P}${K}.`>;
}[keyof T & string];
export type TranslationKey = Paths<Dictionary>;

export type Locale = 'pt-BR' | 'en-US' | 'de-DE';
export type TFunction = (key: TranslationKey, vars?: Record<string, string | number>) => string;
