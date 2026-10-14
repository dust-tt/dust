import { useLocaleSync } from "@app/hooks/useLocaleSync";
import { useUserLocale } from "@app/hooks/useUserLocale";
import { useFeatureFlags, useWorkspace } from "@app/lib/auth/AuthContext";
import { DEFAULT_LOCALE } from "@app/types/locale";

interface UserLocaleSyncProps {
  onReady?: () => void;
}

/**
 * @cc [owner:sfriquet,label:product] active-locale-follows-user-locale
 * MUST be synced with `useLocaleSync`, so that the locale override applies whether or not the
 * `localisation` flag is enabled. When the flag is disabled, the locale MUST be `DEFAULT_LOCALE`
 * and the format locale `undefined` (the browser's locale); otherwise both MUST be the
 * `userLocale` of `useUserLocale`.
 */
export function UserLocaleSync({ onReady }: UserLocaleSyncProps) {
  const owner = useWorkspace();
  const { hasFeature } = useFeatureFlags();
  const hasLocalisation = hasFeature("localisation");
  const { userLocale } = useUserLocale({ owner });

  useLocaleSync({
    locale: hasLocalisation ? userLocale : DEFAULT_LOCALE,
    formatLocale: hasLocalisation ? userLocale : undefined,
    onReady,
  });

  return null;
}
