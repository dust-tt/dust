import { i18n } from "@app/lib/i18n/i18n";
import {
  CATALOG_LOCALE_BY_LOCALE,
  DEFAULT_LOCALE,
  isSupportedLocale,
} from "@app/types/locale";
import { SparkleI18nProvider } from "@dust-tt/sparkle/i18n";
import { I18nProvider, useLingui } from "@lingui/react";
import type { ReactNode } from "react";

// Renders sparkle in the catalog locale of front's active locale. The pseudo locale is front-only:
// sparkle renders its source catalog.
function SparkleLocaleSync({ children }: { children: ReactNode }) {
  const activeLocale = useLingui().i18n.locale;
  const locale = isSupportedLocale(activeLocale)
    ? activeLocale
    : DEFAULT_LOCALE;

  return (
    <SparkleI18nProvider locale={CATALOG_LOCALE_BY_LOCALE[locale]}>
      {children}
    </SparkleI18nProvider>
  );
}

/**
 * @cc [owner:ykmsd,label:product;react] app-i18n-provider-syncs-sparkle
 * A tree that renders front or sparkle text MUST be wrapped in `AppI18nProvider` rather than a bare
 * `I18nProvider`, so that sparkle components render in the catalog locale of front's active
 * locale. Sparkle's locale MUST only change when front's active locale changes, which happens once
 * both catalogs are loaded (`load-catalog-waits-for-sparkle`).
 */
export function AppI18nProvider({ children }: { children: ReactNode }) {
  return (
    <I18nProvider i18n={i18n}>
      <SparkleLocaleSync>{children}</SparkleLocaleSync>
    </I18nProvider>
  );
}
