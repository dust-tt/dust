import { LocaleSync } from "@app/components/app/LocaleSync";
import { useUserLocale } from "@app/hooks/useUserLocale";
import { useFeatureFlags, useWorkspace } from "@app/lib/auth/AuthContext";
import { useLocaleOverride } from "@app/lib/i18n/locale_override";
import { DEFAULT_LOCALE, PSEUDO_LOCALE } from "@app/types/locale";

interface UserLocaleSyncProps {
  onReady?: () => void;
}

/**
 * @cc [owner:sfriquet,label:product] active-locale-follows-user-locale
 * The locale synced with `LocaleSync` MUST be the locale override of `useLocaleOverride` when
 * non-null, whether or not the `localisation` flag is enabled. Otherwise it MUST be
 * `DEFAULT_LOCALE` when the `localisation` flag is disabled, and the `userLocale` of
 * `useUserLocale` otherwise.
 */
/**
 * @cc [owner:sfriquet,label:product] format-locale-follows-user-locale
 * The format locale synced with `LocaleSync` MUST be `DEFAULT_LOCALE` when the locale override is
 * `PSEUDO_LOCALE`, and the locale override when it is another non-null locale. Otherwise it MUST be
 * `undefined` (the browser's locale) when the `localisation` flag is disabled, and the `userLocale`
 * of `useUserLocale` otherwise.
 */
export function UserLocaleSync({ onReady }: UserLocaleSyncProps) {
  const owner = useWorkspace();
  const { hasFeature } = useFeatureFlags();
  const hasLocalisation = hasFeature("localisation");
  const { userLocale } = useUserLocale({ owner });
  const localeOverride = useLocaleOverride();
  const locale =
    localeOverride ?? (hasLocalisation ? userLocale : DEFAULT_LOCALE);
  const formatLocale =
    localeOverride === PSEUDO_LOCALE
      ? DEFAULT_LOCALE
      : (localeOverride ?? (hasLocalisation ? userLocale : undefined));

  return (
    <LocaleSync locale={locale} formatLocale={formatLocale} onReady={onReady} />
  );
}
