// Kept import-free: `lingui.config.ts` loads it before the catalogs are compiled.
export const VIZ_SOURCE_LOCALE = "en-US";

/**
 * @cc [owner:ykmsd,label:product] viz-catalog-locales-match-front
 * `VIZ_CATALOG_LOCALES` MUST contain every `CATALOG_LOCALES` entry of `front/types/locale.ts`, so
 * that viz has a catalog for each language front can request. Each entry MUST have a catalog under
 * `viz/locales/{locale}/`.
 */
export const VIZ_CATALOG_LOCALES = [VIZ_SOURCE_LOCALE, "fr-FR"] as const;

export type VizCatalogLocale = (typeof VIZ_CATALOG_LOCALES)[number];
