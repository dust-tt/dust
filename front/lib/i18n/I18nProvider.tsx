import { activateLocale, i18n } from "@app/lib/i18n/i18n";
import { LOCALE_METADATA_KEY, resolveLocale } from "@app/lib/i18n/locales";
import { useUserMetadata } from "@app/lib/swr/user";
import logger from "@app/logger/logger";
import { I18nProvider } from "@lingui/react";
import type { ReactNode } from "react";
import { useEffect } from "react";

/**
 * Mounts Lingui for the authenticated app and keeps the active locale in sync with the user's
 * stored preference (`locale` user metadata).
 *
 * @cc [owner:sfriquet,label:product] provider-renders-english-until-preference-known
 * Children MUST render immediately in English while the preference is loading or absent; the
 * provider MUST NOT block rendering on the metadata request or on the catalog download.
 */
export function AppI18nProvider({ children }: { children: ReactNode }) {
  const { metadata } = useUserMetadata(LOCALE_METADATA_KEY);
  const locale = resolveLocale(metadata?.value);

  // Syncs the external i18n singleton and the document language with the resolved preference.
  useEffect(() => {
    let cancelled = false;
    if (i18n.locale !== locale) {
      activateLocale(locale)
        .then(() => {
          if (!cancelled) {
            document.documentElement.lang = locale;
          }
        })
        .catch((error) => {
          logger.error({ error, locale }, "Failed to activate UI locale");
        });
    } else {
      document.documentElement.lang = locale;
    }
    return () => {
      cancelled = true;
    };
  }, [locale]);

  return <I18nProvider i18n={i18n}>{children}</I18nProvider>;
}
