import {
  CATALOG_LOCALE_BY_LOCALE,
  DEFAULT_LOCALE,
  isSupportedLocale,
} from "@app/types/locale";
import type { SparkleCatalogLocale } from "@dust-tt/sparkle/i18n";

export function getSparkleLocale(locale: string): SparkleCatalogLocale {
  return CATALOG_LOCALE_BY_LOCALE[
    isSupportedLocale(locale) ? locale : DEFAULT_LOCALE
  ];
}
