/**
 * @cc [owner:Nils-Fedrigo,label:product] copy-of-front-locales
 * This file MUST be a copy of the declarations of the same names in `front/types/locale.ts`, which
 * connectors cannot import: the locales are defined there and edited in both files.
 */

export const SUPPORTED_LOCALES = ["en-US", "en-GB", "fr-FR", "de-DE"] as const;

export type SupportedLocale = (typeof SUPPORTED_LOCALES)[number];

export const DEFAULT_LOCALE: SupportedLocale = "en-US";

export const CATALOG_LOCALES = [
  "en-US",
  "en-GB",
  "fr-FR",
  "de-DE",
] as const satisfies readonly SupportedLocale[];

export type CatalogLocale = (typeof CATALOG_LOCALES)[number];

export const CATALOG_LOCALE_BY_LOCALE: Record<SupportedLocale, CatalogLocale> =
  {
    "en-US": "en-US",
    "en-GB": "en-GB",
    "fr-FR": "fr-FR",
    "de-DE": "de-DE",
  };

export function isSupportedLocale(value: unknown): value is SupportedLocale {
  return SUPPORTED_LOCALES.some((locale) => locale === value);
}
