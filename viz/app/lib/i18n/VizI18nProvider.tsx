"use client";

import { SparkleI18nProvider } from "@dust-tt/sparkle/i18n";
import { setupI18n } from "@lingui/core";
import { I18nProvider } from "@lingui/react";
import type { VizCatalog } from "@viz/app/lib/i18n/catalogs";
import type { ReactNode } from "react";
import { useEffect, useMemo } from "react";

interface VizI18nProviderProps {
  catalog: VizCatalog;
  children: ReactNode;
}

/**
 * @cc [owner:ykmsd,label:product;react] viz-i18n-provider-renders-locale
 * Viz messages below a `VizI18nProvider` MUST render in `catalog.locale`, on the server and in the
 * first client render alike, without depending on Lingui's global `i18n`. Sparkle components below
 * it MUST follow that locale through `SparkleI18nProvider`. While mounted, `<html lang>` MUST be
 * that locale.
 */
export function VizI18nProvider({
  catalog: { locale, messages },
  children,
}: VizI18nProviderProps) {
  // Lingui's global `i18n` is shared by every request the server renders, so activating it per
  // request would let concurrent requests in different locales render each other's language.
  const i18n = useMemo(
    () => setupI18n({ locale, messages: { [locale]: messages } }),
    [locale, messages]
  );

  // The root layout cannot read the page's locale, so the document language is synced here.
  useEffect(() => {
    document.documentElement.lang = locale;
  }, [locale]);

  return (
    <I18nProvider i18n={i18n}>
      <SparkleI18nProvider locale={locale}>{children}</SparkleI18nProvider>
    </I18nProvider>
  );
}
