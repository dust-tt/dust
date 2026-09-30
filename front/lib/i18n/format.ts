import type { SupportedLocale } from "@app/types/locale";

let activeFormatLocale: SupportedLocale | undefined;

/**
 * @cc [owner:sfriquet,label:product] format-locale-resolution
 * Every formatter of this module MUST format in the `locale` argument when one is given, otherwise
 * in the locale last passed to `setFormatLocale`, and in the runtime's default locale (the
 * browser's) when that is `undefined` or was never set.
 */
export function setFormatLocale(locale: SupportedLocale | undefined): void {
  activeFormatLocale = locale;
}

export function formatDate(
  date: Date | number,
  options?: Intl.DateTimeFormatOptions,
  locale: SupportedLocale | undefined = activeFormatLocale
): string {
  return new Date(date).toLocaleDateString(locale, options);
}

export function formatTime(
  date: Date | number,
  options?: Intl.DateTimeFormatOptions,
  locale: SupportedLocale | undefined = activeFormatLocale
): string {
  return new Date(date).toLocaleTimeString(locale, options);
}

export function formatDateTime(
  date: Date | number,
  options?: Intl.DateTimeFormatOptions,
  locale: SupportedLocale | undefined = activeFormatLocale
): string {
  return new Date(date).toLocaleString(locale, options);
}

export function formatNumber(
  value: number | bigint,
  options?: Intl.NumberFormatOptions,
  locale: SupportedLocale | undefined = activeFormatLocale
): string {
  return new Intl.NumberFormat(locale, options).format(value);
}

export function formatRelativeTime(
  value: number,
  unit: Intl.RelativeTimeFormatUnit,
  options?: Intl.RelativeTimeFormatOptions,
  locale: SupportedLocale | undefined = activeFormatLocale
): string {
  return new Intl.RelativeTimeFormat(locale, options).format(value, unit);
}

export function formatCurrency(
  amountCurrencyUnits: number,
  currency: string,
  options?: Omit<Intl.NumberFormatOptions, "style" | "currency">,
  locale: SupportedLocale | undefined = activeFormatLocale
): string {
  return formatNumber(
    amountCurrencyUnits,
    { ...options, style: "currency", currency },
    locale
  );
}

export function formatFileSize(
  bytes: number,
  locale: SupportedLocale | undefined = activeFormatLocale
): string {
  if (bytes < 1024) {
    return `${formatNumber(bytes, { useGrouping: false }, locale)} B`;
  }
  if (bytes < 1024 * 1024) {
    return `${formatNumber(
      bytes / 1024,
      {
        minimumFractionDigits: 1,
        maximumFractionDigits: 1,
        useGrouping: false,
      },
      locale
    )} KB`;
  }
  return `${formatNumber(
    bytes / (1024 * 1024),
    { minimumFractionDigits: 2, maximumFractionDigits: 2, useGrouping: false },
    locale
  )} MB`;
}

export function prefersTwentyFourHourTime(
  locale: SupportedLocale | undefined = activeFormatLocale
): boolean {
  const { hourCycle } = new Intl.DateTimeFormat(locale, {
    hour: "numeric",
  }).resolvedOptions();
  return hourCycle === "h23" || hourCycle === "h24";
}

export function getLocalTimeZone(): string {
  return Intl.DateTimeFormat().resolvedOptions().timeZone;
}
