import type { SparkleFormatLocale } from "@sparkle/lib/i18n/locales";
import { useLingui } from "@sparkle/lib/i18n/useLingui";

// Mirrors the date, time, number and relative time functions of `front/lib/i18n/format.ts`. Sparkle
// has no global format locale: components read the one of their `SparkleI18nProvider` with
// `useFormatLocale` and pass it explicitly.

/**
 * @cc [owner:ykmsd,label:product] sparkle-format-locale-resolution
 * Every function of this module that takes a `locale` argument MUST format in that locale, and in
 * the runtime's default locale (the browser's) when it is `undefined`.
 */
export function formatDate(
  date: Date | number | string,
  options?: Intl.DateTimeFormatOptions,
  locale?: string
): string {
  return new Date(date).toLocaleDateString(locale, options);
}

export function formatTime(
  date: Date | number | string,
  options?: Intl.DateTimeFormatOptions,
  locale?: string
): string {
  return new Date(date).toLocaleTimeString(locale, options);
}

export function formatDateTime(
  date: Date | number | string,
  options?: Intl.DateTimeFormatOptions,
  locale?: string
): string {
  return new Date(date).toLocaleString(locale, options);
}

export function formatNumber(
  value: number | bigint,
  options?: Intl.NumberFormatOptions,
  locale?: string
): string {
  return new Intl.NumberFormat(locale, options).format(value);
}

export function formatRelativeTime(
  value: number,
  unit: Intl.RelativeTimeFormatUnit,
  options?: Intl.RelativeTimeFormatOptions,
  locale?: string
): string {
  return new Intl.RelativeTimeFormat(locale, options).format(value, unit);
}

/**
 * @cc [owner:ykmsd,label:product;react] use-format-locale-follows-provider
 * `useFormatLocale` MUST return the `formatLocale` of the closest `SparkleI18nProvider`, and
 * `undefined` (formatting in the runtime's default locale) when it has none or there is no provider.
 */
export function useFormatLocale(): SparkleFormatLocale | undefined {
  return useLingui().formatLocale;
}
