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
