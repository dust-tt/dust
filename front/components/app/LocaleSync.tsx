import { useLocaleSync } from "@app/components/app/useLocaleSync";
import type { LocaleOverride } from "@app/lib/i18n/locale_override";
import { useLocaleOverride } from "@app/lib/i18n/locale_override";
import type { SupportedLocale } from "@app/types/locale";
import { DEFAULT_LOCALE, PSEUDO_LOCALE } from "@app/types/locale";
import type { ReactNode } from "react";
import { useCallback, useState } from "react";

interface LocaleSyncProps {
  locale: SupportedLocale;
  // Rendered until the resolved locale is active.
  fallback: ReactNode;
  children: ReactNode;
}

/**
 * Activates a locale resolved by the caller, for pages rendered outside of the auth context such
 * as the join page. Pages under `WorkspacePage` get `UserLocaleSync` instead.
 */
/**
 * @cc [owner:ykmsd,label:product;react] children-after-resolved-locale-ready
 * `children` MUST NOT be rendered before the catalog load of the resolved locale has settled;
 * `fallback` MUST be rendered instead, including again from the render in which the resolved
 * locale changes to a locale whose catalog load has not settled yet. Once the load settles,
 * `children` MUST be rendered, even when it failed and the previous locale stays active.
 */
export function LocaleSync({ locale, fallback, children }: LocaleSyncProps) {
  const localeOverride = useLocaleOverride();
  const resolvedLocale = localeOverride ?? locale;
  const formatLocale =
    localeOverride === PSEUDO_LOCALE
      ? DEFAULT_LOCALE
      : (localeOverride ?? locale);

  const [readyLocale, setReadyLocale] = useState<LocaleOverride | null>(null);
  const onReady = useCallback(
    () => setReadyLocale(resolvedLocale),
    [resolvedLocale]
  );

  useLocaleSync({ locale: resolvedLocale, formatLocale, onReady });

  return <>{readyLocale === resolvedLocale ? children : fallback}</>;
}
