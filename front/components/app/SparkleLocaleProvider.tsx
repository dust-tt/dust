import { getSparkleLocale } from "@app/lib/i18n/sparkle_locale";
import { SparkleI18nProvider } from "@dust-tt/sparkle/i18n";
import { useLingui } from "@lingui/react";
import type { ReactNode } from "react";

interface SparkleLocaleProviderProps {
  children: ReactNode;
}

/**
 * @cc [owner:ykmsd,label:product;react] sparkle-follows-front-locale
 * Rendered under front's `I18nProvider`, sparkle components MUST render in the sparkle locale that
 * `getSparkleLocale` maps front's active locale to, and switch in the same render as front's
 * messages. Front MUST preload that sparkle locale before activating its own (see
 * `UserLocaleSync`), otherwise sparkle renders English.
 */
export function SparkleLocaleProvider({ children }: SparkleLocaleProviderProps) {
  const { i18n } = useLingui();
  return (
    <SparkleI18nProvider locale={getSparkleLocale(i18n.locale)}>
      {children}
    </SparkleI18nProvider>
  );
}
