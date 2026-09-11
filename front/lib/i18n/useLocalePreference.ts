import type { SupportedLocale } from "@app/lib/i18n/locales";
import { LOCALE_METADATA_KEY, resolveLocale } from "@app/lib/i18n/locales";
import { useUserMetadata } from "@app/lib/swr/user";
import { setUserMetadataFromClient } from "@app/lib/user";
import { useCallback } from "react";

/**
 * Reads and writes the user's UI locale preference. Shares its SWR cache entry with
 * `AppI18nProvider`, so a successful `setLocale` re-renders the whole app in the new language.
 */
export function useLocalePreference() {
  const { metadata, mutateMetadata } = useUserMetadata(LOCALE_METADATA_KEY);
  const locale = resolveLocale(metadata?.value);

  const setLocale = useCallback(
    async (nextLocale: SupportedLocale) => {
      await setUserMetadataFromClient({
        key: LOCALE_METADATA_KEY,
        value: nextLocale,
      });
      await mutateMetadata();
    },
    [mutateMetadata]
  );

  return { locale, setLocale };
}
