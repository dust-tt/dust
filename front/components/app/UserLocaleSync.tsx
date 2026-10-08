import { useUserLocale } from "@app/hooks/useUserLocale";
import { useFeatureFlags, useWorkspace } from "@app/lib/auth/AuthContext";
import { setFormatLocale } from "@app/lib/i18n/format";
import { i18n, loadCatalog } from "@app/lib/i18n/i18n";
import type { LocaleOverride } from "@app/lib/i18n/locale_override";
import { useLocaleOverride } from "@app/lib/i18n/locale_override";
import { getSparkleLocale } from "@app/lib/i18n/sparkle_locale";
import logger from "@app/logger/logger";
import type { SupportedLocale } from "@app/types/locale";
import { DEFAULT_LOCALE, PSEUDO_LOCALE } from "@app/types/locale";
import { preloadSparkleLocale } from "@dust-tt/sparkle/i18n";
import type { Messages } from "@lingui/core";
import { useEffect } from "react";

async function loadUiCatalog(locale: LocaleOverride): Promise<Messages> {
  if (locale !== PSEUDO_LOCALE) {
    return loadCatalog(locale);
  }
  // Loaded on demand to keep pseudo-localization out of the main bundle and of front-api, which
  // bundles `lib/i18n/i18n.ts`.
  const { pseudoLocalizeMessages } =
    await import("@app/lib/i18n/pseudo_locale");
  return pseudoLocalizeMessages(await loadCatalog(DEFAULT_LOCALE));
}

interface LocaleSyncProps {
  userLocale: SupportedLocale | null;
  onReady?: () => void;
}

/**
 * @cc [owner:sfriquet,label:product] active-locale-follows-user-locale
 * Once its catalog has loaded, the active UI locale MUST be the locale override of
 * `useLocaleOverride` when non-null. Otherwise it MUST be `userLocale` when non-null, and
 * `DEFAULT_LOCALE` otherwise. While the catalog loads or after it failed to load,
 * `locale-switch-never-blocks-rendering` applies.
 */
/**
 * @cc [owner:sfriquet,label:product] format-locale-follows-user-locale
 * Once the catalog of the resolved locale has loaded, the format locale set with `setFormatLocale`
 * MUST be `DEFAULT_LOCALE` when the locale override is `PSEUDO_LOCALE`, and the locale override
 * when it is another non-null locale. Otherwise it MUST be `userLocale` when non-null, and
 * `undefined` (the browser's locale) otherwise. It MUST be set before the UI locale is activated.
 */
/**
 * @cc [owner:sfriquet,label:product;react] locale-switch-never-blocks-rendering
 * Rendering MUST NOT wait for the user locale or its catalog: the previously active locale stays
 * active until the new catalog is loaded. A catalog that finishes loading after the resolved locale
 * changed again MUST NOT be activated, and a failed load MUST leave the active locale unchanged.
 * Loading a catalog is a background sync exempt from `async-network-loading-state`: it MUST NOT
 * show a loading state of its own.
 */
/**
 * @cc [owner:ykmsd,label:product] locale-activated-with-sparkle-catalog
 * The resolved locale MUST NOT be activated before the sparkle locale `getSparkleLocale` maps it to
 * is preloaded, so that front and sparkle switch locale in the same render. A failed sparkle preload
 * counts as a failed catalog load.
 */
/**
 * @cc [owner:sfriquet,label:react] ready-after-resolved-locale-load
 * `onReady` MUST be called once the catalog load of the resolved locale settles, whether it
 * succeeded or failed, and MUST NOT be called for a load whose locale is no longer the resolved one.
 */
export function LocaleSync({ userLocale, onReady }: LocaleSyncProps) {
  const localeOverride = useLocaleOverride();
  const locale = localeOverride ?? userLocale ?? DEFAULT_LOCALE;
  const formatLocale =
    localeOverride === PSEUDO_LOCALE
      ? DEFAULT_LOCALE
      : (localeOverride ?? userLocale ?? undefined);

  // Syncs the format locale, the external Lingui instance and the document language with the
  // resolved locale.
  useEffect(() => {
    let isCurrent = true;
    const sparkleLocale = getSparkleLocale(locale);
    Promise.all([loadUiCatalog(locale), preloadSparkleLocale(sparkleLocale)])
      .then(([messages]) => {
        if (isCurrent) {
          setFormatLocale(formatLocale);
          i18n.loadAndActivate({ locale, messages });
          document.documentElement.lang = locale;
        }
      })
      .catch((error) => {
        logger.error({ error, locale }, "Failed to load the UI locale catalog");
      })
      .finally(() => {
        if (isCurrent) {
          onReady?.();
        }
      });
    return () => {
      isCurrent = false;
    };
  }, [locale, formatLocale, onReady]);

  return null;
}

interface UserLocaleSyncProps {
  onReady?: () => void;
}

/**
 * @cc [owner:sfriquet,label:product] user-locale-behind-localisation-flag
 * The `userLocale` passed to `LocaleSync` MUST be the `userLocale` of `useUserLocale` when the
 * `localisation` flag of the current workspace is enabled, and `null` otherwise.
 */
export function UserLocaleSync({ onReady }: UserLocaleSyncProps) {
  const owner = useWorkspace();
  const { hasFeature } = useFeatureFlags();
  const hasLocalisation = hasFeature("localisation");
  const { userLocale } = useUserLocale({ owner });

  return (
    <LocaleSync
      userLocale={hasLocalisation ? userLocale : null}
      onReady={onReady}
    />
  );
}
