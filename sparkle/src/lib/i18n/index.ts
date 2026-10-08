// Entry point of `@dust-tt/sparkle/i18n`. The provider loads sparkle's catalogs itself; apps
// preload a locale to switch to it in the same render as their own messages.
export { preloadSparkleLocale } from "@sparkle/lib/i18n/catalogs";
export {
  SPARKLE_CATALOG_LOCALES,
  SPARKLE_FORMAT_LOCALES,
  type SparkleCatalogLocale,
  type SparkleFormatLocale,
} from "@sparkle/lib/i18n/locales";
export { SparkleI18nProvider } from "@sparkle/lib/i18n/SparkleI18nProvider";
