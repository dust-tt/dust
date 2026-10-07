import {
  CATALOG_LOCALE_BY_LOCALE,
  DEFAULT_LOCALE,
  isSupportedLocale,
} from "@app/types/locale";
import type { SparkleCatalogLocale } from "@dust-tt/sparkle/i18n";

/**
 * @cc [owner:ykmsd,label:product] sparkle-locale-follows-catalog-locale
 * For a `SupportedLocale`, `getSparkleLocale` MUST return the catalog locale front renders it with
 * (`CATALOG_LOCALE_BY_LOCALE`). For any other locale (the pseudo-locale), it MUST return the catalog
 * locale of `DEFAULT_LOCALE`: pseudo-localization only covers front's own messages.
 */
export function getSparkleLocale(locale: string): SparkleCatalogLocale {
  return CATALOG_LOCALE_BY_LOCALE[
    isSupportedLocale(locale) ? locale : DEFAULT_LOCALE
  ];
}
