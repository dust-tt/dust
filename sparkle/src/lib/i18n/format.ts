import type { SparkleFormatLocale } from "@sparkle/lib/i18n/locales";
import { useLingui } from "@sparkle/lib/i18n/useLingui";

// Mirrors the functions of `front/lib/i18n/format.ts`, added here as sparkle components need them.
// Sparkle has no global format locale: components read the one of their `SparkleI18nProvider` with
// `useFormatLocale` and pass it explicitly.

/**
 * @cc [owner:ykmsd,label:product] sparkle-format-locale-resolution
 * Every function of this module that takes a `locale` argument MUST format in that locale, and in
 * the runtime's default locale (the browser's) when it is `undefined`.
 */
export function formatNumber(
  value: number | bigint,
  options?: Intl.NumberFormatOptions,
  locale?: string
): string {
  return new Intl.NumberFormat(locale, options).format(value);
}

/**
 * @cc [owner:ykmsd,label:product;react] use-format-locale-follows-provider
 * `useFormatLocale` MUST return the `formatLocale` of the closest `SparkleI18nProvider`, which is
 * `undefined` (formatting in the runtime's default locale) when the provider has none. Without a
 * provider it MUST return `en-US`, so that sparkle formats like the catalog it renders.
 */
export function useFormatLocale(): SparkleFormatLocale | undefined {
  return useLingui().formatLocale;
}
