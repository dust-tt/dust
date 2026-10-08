import {
  getLoadedSparkleI18n,
  loadSparkleI18n,
  sourceLocaleI18n,
} from "@sparkle/lib/i18n/catalogs";
import type {
  SparkleCatalogLocale,
  SparkleFormatLocale,
} from "@sparkle/lib/i18n/locales";
import { SparkleI18nContext } from "@sparkle/lib/i18n/useLingui";
import { reportToDatadog } from "@sparkle/lib/reportToDatadog";
import React, { useEffect, useMemo, useState } from "react";

interface SparkleI18nProviderProps {
  locale: SparkleCatalogLocale;
  /** Locale to format numbers and dates in, the browser's when `undefined`. */
  formatLocale?: SparkleFormatLocale;
  children: React.ReactNode;
}

/**
 * @cc [owner:ykmsd,label:product;react] sparkle-i18n-provider-follows-locale
 * Sparkle components below a `SparkleI18nProvider` MUST render in `locale` once its catalog is
 * loaded, and in the same render as the `locale` change when that catalog was already loaded.
 * While the catalog loads, or after it failed to load, they MUST keep rendering the previously
 * rendered locale, and a catalog that finishes loading after `locale` changed again MUST NOT be
 * rendered.
 */
/**
 * @cc [owner:ykmsd,label:product] sparkle-i18n-provider-follows-format-locale
 * `useFormatLocale` below a `SparkleI18nProvider` MUST return its `formatLocale` from the render
 * where it changes, independently of the catalog of `locale` (which may still be loading). The
 * format locale MUST NOT affect the messages, so that plural forms follow the catalog's language.
 */
export function SparkleI18nProvider({
  locale,
  formatLocale,
  children,
}: SparkleI18nProviderProps) {
  const loadedI18n = getLoadedSparkleI18n(locale);
  const [renderedI18n, setRenderedI18n] = useState(
    () => loadedI18n ?? sourceLocaleI18n
  );
  // Adjusted during render rather than in an effect, so that a preloaded catalog never renders a
  // frame in the previous locale.
  if (loadedI18n && loadedI18n !== renderedI18n) {
    setRenderedI18n(loadedI18n);
  }

  useEffect(() => {
    if (loadedI18n) {
      return;
    }
    let isCurrent = true;
    loadSparkleI18n(locale)
      .then((i18n) => {
        if (isCurrent) {
          setRenderedI18n(i18n);
        }
      })
      .catch((error) => {
        reportToDatadog(error, {
          source: "SparkleI18nProvider",
          event: "catalog_load_failed",
          locale,
        });
      });
    return () => {
      isCurrent = false;
    };
  }, [locale, loadedI18n]);

  const context = useMemo(
    () => ({ i18n: renderedI18n, _: renderedI18n.t, formatLocale }),
    [renderedI18n, formatLocale]
  );

  return (
    <SparkleI18nContext.Provider value={context}>
      {children}
    </SparkleI18nContext.Provider>
  );
}
