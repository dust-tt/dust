import { LocaleSync } from "@app/components/app/LocaleSync";
import { useUserLocale } from "@app/hooks/useUserLocale";
import { useFeatureFlags, useWorkspace } from "@app/lib/auth/AuthContext";

interface UserLocaleSyncProps {
  onReady?: () => void;
}

/**
 * @cc [owner:sfriquet,label:product] locale-is-user-locale
 * The `locale` passed to `LocaleSync` MUST be the `userLocale` of `useUserLocale` when the
 * `localisation` flag is enabled, and `null` otherwise.
 */
export function UserLocaleSync({ onReady }: UserLocaleSyncProps) {
  const owner = useWorkspace();
  const { hasFeature } = useFeatureFlags();
  const { userLocale } = useUserLocale({ owner });

  return (
    <LocaleSync
      locale={hasFeature("localisation") ? userLocale : null}
      onReady={onReady}
    />
  );
}
