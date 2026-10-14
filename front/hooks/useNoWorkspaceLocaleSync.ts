import { useLocaleSync } from "@app/hooks/useLocaleSync";
import type { SupportedLocale } from "@app/types/locale";
import { DEFAULT_LOCALE } from "@app/types/locale";

interface UseNoWorkspaceLocaleSyncParams {
  preferredLocale?: SupportedLocale | null;
  onReady?: () => void;
}

/**
 * @cc [owner:ykmsd,label:product] active-locale-follows-preferred-or-default-locale
 * MUST be synced with `useLocaleSync`, with `preferredLocale` when non-null and `DEFAULT_LOCALE`
 * otherwise as locale, and `preferredLocale` when non-null and `undefined`
 * (the browser's locale) otherwise as format locale. It MUST NOT require an `AuthContext` nor
 * depend on the `localisation` flag, so that it can be used on pages outside a workspace,
 * including to signed-out visitors.
 */
export function useNoWorkspaceLocaleSync({
  preferredLocale,
  onReady,
}: UseNoWorkspaceLocaleSyncParams): void {
  useLocaleSync({
    locale: preferredLocale ?? DEFAULT_LOCALE,
    formatLocale: preferredLocale ?? undefined,
    onReady,
  });
}
