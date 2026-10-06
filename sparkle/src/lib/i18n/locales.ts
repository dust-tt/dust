// Kept import-free and separate from `catalogs.ts`: `lingui.config.ts` loads it before the catalogs
// are compiled.
export const SPARKLE_SOURCE_LOCALE = "en-US";

export const SPARKLE_CATALOG_LOCALES = [SPARKLE_SOURCE_LOCALE] as const;
