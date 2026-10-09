// Kept import-free and separate from `catalogs.ts`: `lingui.config.ts` loads it before the catalogs
// are compiled.
export const SPARKLE_SOURCE_LOCALE = "en-US";

/**
 * @cc [owner:ykmsd,label:product] sparkle-catalog-locales-match-front
 * `SPARKLE_CATALOG_LOCALES` MUST contain every `CATALOG_LOCALES` entry of `front/types/locale.ts`,
 * so that front can load a sparkle catalog for each of its catalogs. Each entry MUST have a catalog
 * under `sparkle/src/locales/{locale}/`.
 */
export const SPARKLE_CATALOG_LOCALES = [
  SPARKLE_SOURCE_LOCALE,
  "fr-FR",
] as const;

export type SparkleCatalogLocale = (typeof SPARKLE_CATALOG_LOCALES)[number];

/**
 * @cc [owner:ykmsd,label:product] sparkle-format-locales-match-front
 * `SPARKLE_FORMAT_LOCALES` MUST contain every `SUPPORTED_LOCALES` entry of `front/types/locale.ts`,
 * so that front can format sparkle components in each of its locales. Front's `SparkleLocaleProvider`
 * fails to typecheck when one is missing.
 */
export const SPARKLE_FORMAT_LOCALES = ["en-US", "en-GB", "fr-FR"] as const;

export type SparkleFormatLocale = (typeof SPARKLE_FORMAT_LOCALES)[number];
