export const SUPPORTED_LOCALES = ["en-US", "en-GB", "fr-FR"] as const;

export type SupportedLocale = (typeof SUPPORTED_LOCALES)[number];

export const DEFAULT_LOCALE: SupportedLocale = "en-US";

/**
 * @cc [owner:ykmsd,label:product] catalog-locales-added-to-sparkle-and-viz
 * A locale added to `CATALOG_LOCALES` MUST also be added, with its catalog, to
 * `SPARKLE_CATALOG_LOCALES` (sparkle/src/lib/i18n/locales.ts) and `VIZ_CATALOG_LOCALES`
 * (viz/app/lib/i18n/locales.ts).
 */
export const CATALOG_LOCALES = [
  "en-US",
  "fr-FR",
] as const satisfies readonly SupportedLocale[];

export type CatalogLocale = (typeof CATALOG_LOCALES)[number];

export const PSEUDO_LOCALE = "pseudo";

export type PseudoLocale = typeof PSEUDO_LOCALE;

/**
 * @cc [owner:sfriquet,label:product] en-gb-shares-en-us-catalog
 * `en-GB` MUST render the messages of the `en-US` catalog: it only changes date and number
 * formatting, and MUST NOT have a catalog of its own. Only `CATALOG_LOCALES` MUST have catalogs
 * under `front/locales/`.
 */
export const CATALOG_LOCALE_BY_LOCALE: Record<SupportedLocale, CatalogLocale> =
  {
    "en-US": "en-US",
    "en-GB": "en-US",
    "fr-FR": "fr-FR",
  };

// Native names: a user who cannot read the current UI language must still recognize their own.
export const LOCALE_LABELS: Record<SupportedLocale, string> = {
  "en-US": "English (US)",
  "en-GB": "English (UK)",
  "fr-FR": "Français",
};

export const USER_LOCALE_METADATA_KEY = "locale";

export function isSupportedLocale(value: unknown): value is SupportedLocale {
  return SUPPORTED_LOCALES.some((locale) => locale === value);
}
