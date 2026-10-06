import {
  getLoadedSparkleI18n,
  loadSparkleI18n,
  sourceLocaleI18n,
} from "@sparkle/lib/i18n/catalogs";
import type { SparkleCatalogLocale } from "@sparkle/lib/i18n/locales";
import { SparkleI18nContext, toI18nContext } from "@sparkle/lib/i18n/useLingui";
import React, { useEffect, useMemo, useState } from "react";

interface SparkleI18nProviderProps {
  locale: SparkleCatalogLocale;
  children: React.ReactNode;
}

/**
 * @cc [owner:ykmsd,label:product;react] sparkle-i18n-provider-follows-locale
 * Sparkle components below a `SparkleI18nProvider` MUST render in `locale` once its catalog is
 * loaded, and in the same render as the `locale` change when `loadSparkleCatalog(locale)` had
 * already resolved. While the catalog loads, or after it failed to load, they MUST keep rendering
 * the previously rendered locale, and a catalog that finishes loading after `locale` changed again
 * MUST NOT be rendered.
 */
export function SparkleI18nProvider({
  locale,
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
  const i18n = loadedI18n ?? renderedI18n;

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
        console.warn(
          `Failed to load the sparkle catalog of "${locale}"`,
          error
        );
      });
    return () => {
      isCurrent = false;
    };
  }, [locale, loadedI18n]);

  const context = useMemo(() => toI18nContext(i18n), [i18n]);

  return (
    <SparkleI18nContext.Provider value={context}>
      {children}
    </SparkleI18nContext.Provider>
  );
}
