// Entry point of `@dust-tt/sparkle/i18n`. The provider and the catalog loader MUST come from the same
// entry point: the provider renders the catalogs that `loadSparkleCatalog` loaded into its module.
export { loadSparkleCatalog } from "@sparkle/lib/i18n/catalogs";
export {
  SPARKLE_CATALOG_LOCALES,
  type SparkleCatalogLocale,
} from "@sparkle/lib/i18n/locales";
export { SparkleI18nProvider } from "@sparkle/lib/i18n/SparkleI18nProvider";
