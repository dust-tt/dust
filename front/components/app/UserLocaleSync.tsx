import { useLocaleSync } from "@app/components/app/useLocaleSync";
import { useUserLocale } from "@app/hooks/useUserLocale";
import { useWorkspace } from "@app/lib/auth/AuthContext";
import { useLocaleOverride } from "@app/lib/i18n/locale_override";
import { DEFAULT_LOCALE, PSEUDO_LOCALE } from "@app/types/locale";

interface UserLocaleSyncProps {
  onReady?: () => void;
}

/**
 * @cc [owner:sfriquet,label:product] active-locale-follows-user-locale
 * Once its catalog has loaded, the active UI locale MUST be the locale override of
 * `useLocaleOverride` when non-null, and the `userLocale` of `useUserLocale` otherwise. While the
 * catalog loads or after it failed to load, `locale-switch-never-blocks-rendering` applies.
 */
/**
 * @cc [owner:sfriquet,label:product] format-locale-follows-user-locale
 * Once the catalog of the resolved locale has loaded, the format locale set with `setFormatLocale`
 * MUST be `DEFAULT_LOCALE` when the locale override is `PSEUDO_LOCALE`, the locale override when it
 * is another non-null locale, and the `userLocale` of `useUserLocale` otherwise. It MUST be set
 * before the UI locale is activated.
 */
/**
 * @cc [owner:sfriquet,label:product;react] locale-switch-never-blocks-rendering
 * Rendering MUST NOT wait for the user locale or its catalog: the previously active locale stays
 * active until the new catalog is loaded (see `stale-or-failed-load-not-activated` on
 * `useLocaleSync`). Loading a catalog is a background sync exempt from
 * `async-network-loading-state` (see `loading-state-owned-by-caller` on `useLocaleSync`): it
 * MUST NOT show a loading state, neither on the first load nor on later locale switches.
 */
export function UserLocaleSync({ onReady }: UserLocaleSyncProps) {
  const owner = useWorkspace();
  const { userLocale } = useUserLocale({ owner });
  const localeOverride = useLocaleOverride();
  const locale = localeOverride ?? userLocale;
  const formatLocale =
    localeOverride === PSEUDO_LOCALE ? DEFAULT_LOCALE : locale;

  useLocaleSync({ locale, formatLocale, onReady });

  return null;
}
