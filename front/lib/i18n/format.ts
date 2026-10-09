import type { SupportedLocale } from "@app/types/locale";
import type { IntlFormatDistanceOptions } from "date-fns";
import { intlFormatDistance } from "date-fns";

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

export function getFormatLocale(): SupportedLocale | undefined {
  return activeFormatLocale;
}

/**
 * @cc [owner:sfriquet,label:product] numeric-date-time-matches-date-fns-pp
 * In `en-US`, `formatDateTime` with these options MUST render dates of years 1000 to 9999 as the
 * date-fns `Pp` pattern (`MM/dd/yyyy, h:mm a`, e.g. `09/23/2025, 3:37 PM`). Earlier years are not
 * zero-padded.
 */
export const NUMERIC_DATE_TIME_OPTIONS: Intl.DateTimeFormatOptions = {
  year: "numeric",
  month: "2-digit",
  day: "2-digit",
  hour: "numeric",
  minute: "2-digit",
};

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

/**
 * @cc [owner:sfriquet,label:product] list-words-in-ui-locale
 * Callers inserting a `conjunction` or `disjunction` list into a translated message MUST pass the
 * UI locale (`getActiveLocale`) explicitly: the default format locale is the browser's when the
 * `localisation` flag is off, and an English message MUST NOT read "a et b".
 */
export function formatList(
  values: string[],
  options?: Intl.ListFormatOptions,
  locale: SupportedLocale | undefined = activeFormatLocale
): string {
  return new Intl.ListFormat(locale, options).format(values);
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

type FileSizeUnit = "byte" | "kilobyte" | "megabyte" | "gigabyte";

const DEFAULT_FILE_SIZE_UNIT_SYMBOLS: Record<FileSizeUnit, string> = {
  byte: "B",
  kilobyte: "KB",
  megabyte: "MB",
  gigabyte: "GB",
};

const FILE_SIZE_UNIT_SYMBOLS_BY_LANGUAGE: Record<
  string,
  Record<FileSizeUnit, string>
> = {
  fr: {
    byte: "o",
    kilobyte: "Ko",
    megabyte: "Mo",
    gigabyte: "Go",
  },
};

function getFileSizeUnitSymbols(
  locale: SupportedLocale | undefined
): Record<FileSizeUnit, string> {
  const { language } = new Intl.Locale(
    new Intl.NumberFormat(locale).resolvedOptions().locale
  );
  return (
    FILE_SIZE_UNIT_SYMBOLS_BY_LANGUAGE[language] ??
    DEFAULT_FILE_SIZE_UNIT_SYMBOLS
  );
}

function formatFileSizeInUnit(
  bytes: number,
  unitBytes: number,
  unit: FileSizeUnit,
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
  )} ${getFileSizeUnitSymbols(locale)[unit]}`;
}

/**
 * @cc [owner:sfriquet,label:product] file-size-unit-symbols
 * `formatFileSize` MUST write the unit symbol of the resolved locale's language: `o`, `Ko`, `Mo`
 * and `Go` in French, `B`, `KB`, `MB` and `GB` in every other language.
 */
export function formatFileSize(
  bytes: number,
  options?: { decimals?: number },
  locale: SupportedLocale | undefined = activeFormatLocale
): string {
  const decimals = options?.decimals;
  if (bytes < 1024) {
    return formatFileSizeInUnit(bytes, 1, "byte", decimals ?? 0, locale);
  }
  if (bytes < 1024 * 1024) {
    return formatFileSizeInUnit(bytes, 1024, "kilobyte", decimals ?? 1, locale);
  }
  if (bytes < 1024 * 1024 * 1024) {
    return formatFileSizeInUnit(
      bytes,
      1024 * 1024,
      "megabyte",
      decimals ?? 2,
      locale
    );
  }
  return formatFileSizeInUnit(
    bytes,
    1024 * 1024 * 1024,
    "gigabyte",
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

export function formatTimeDistance(
  date: Date | number,
  baseDate: Date | number,
  options?: Omit<IntlFormatDistanceOptions, "locale">,
  locale: SupportedLocale | undefined = activeFormatLocale
): string {
  return intlFormatDistance(date, baseDate, { ...options, locale });
}
