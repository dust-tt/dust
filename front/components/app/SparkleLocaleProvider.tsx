import { getFormatLocale } from "@app/lib/i18n/format";
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
 * messages. Front MUST preload that sparkle locale before activating its own (see `LocaleSync`),
 * otherwise sparkle renders English. Every app root that mounts `LocaleSync` MUST mount it,
 * otherwise sparkle stays in English while front switches locale.
 */
/**
 * @cc [owner:ykmsd,label:product] sparkle-formats-in-front-format-locale
 * Sparkle components MUST format numbers and dates in front's format locale (`getFormatLocale`,
 * the browser's when `undefined`), so that `en-GB` formats the UK way although it renders the
 * `en-US` catalog. Reading it during render relies on `format-locale-follows-user-locale`: it is
 * set before front's locale activation, which re-renders this provider.
 */
export function SparkleLocaleProvider({
  children,
}: SparkleLocaleProviderProps) {
  const { i18n } = useLingui();
  return (
    <SparkleI18nProvider
      locale={getSparkleLocale(i18n.locale)}
      formatLocale={getFormatLocale()}
    >
      {children}
    </SparkleI18nProvider>
  );
}
