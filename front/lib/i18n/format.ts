import type { SupportedLocale } from "@app/types/locale";

let activeFormatLocale: SupportedLocale | undefined;

/**
 * @cc [owner:sfriquet,label:product] format-locale-resolution
 * Every function of this module that takes a `locale` argument MUST use that locale when one is
 * given, otherwise the locale last passed to `setFormatLocale`, and the runtime's default locale
 * (the browser's) when that is `undefined` or was never set.
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

function formatFileSizeInUnit(
  bytes: number,
  unitBytes: number,
  unit: string,
  decimals: number,
  locale: SupportedLocale | undefined
): string {
  return `${formatNumber(
    bytes / unitBytes,
    {
      minimumFractionDigits: decimals,
      maximumFractionDigits: decimals,
      useGrouping: false,
    },
    locale
  )} ${unit}`;
}

export function formatFileSize(
  bytes: number,
  options?: { decimals?: number },
  locale: SupportedLocale | undefined = activeFormatLocale
): string {
  const decimals = options?.decimals;
  if (bytes < 1024) {
    return formatFileSizeInUnit(bytes, 1, "B", decimals ?? 0, locale);
  }
  if (bytes < 1024 * 1024) {
    return formatFileSizeInUnit(bytes, 1024, "KB", decimals ?? 1, locale);
  }
  if (bytes < 1024 * 1024 * 1024) {
    return formatFileSizeInUnit(
      bytes,
      1024 * 1024,
      "MB",
      decimals ?? 2,
      locale
    );
  }
  return formatFileSizeInUnit(
    bytes,
    1024 * 1024 * 1024,
    "GB",
    decimals ?? 2,
    locale
  );
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

const collators = new Map<string, Intl.Collator>();

function getCollator(
  locale: SupportedLocale | undefined,
  options: Intl.CollatorOptions | undefined
): Intl.Collator {
  const key = `${locale ?? ""}:${JSON.stringify(options ?? {})}`;
  let collator = collators.get(key);
  if (!collator) {
    collator = new Intl.Collator(locale, options);
    collators.set(key, collator);
  }
  return collator;
}

export function compareStrings(
  a: string,
  b: string,
  options?: Intl.CollatorOptions,
  locale: SupportedLocale | undefined = activeFormatLocale
): number {
  return getCollator(locale, options).compare(a, b);
}
