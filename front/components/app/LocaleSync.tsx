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
 *
 * TODO(ykmsd): once the `localisation` feature flag ships, move the locale-override resolution into
 * `useLocaleSync` so that this component and `UserLocaleSync` only pass the locale they resolve.
 * They stay separate: this one holds back its children until the locale is active, while
 * `UserLocaleSync` reports ready to the app-wide startup loader.
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
