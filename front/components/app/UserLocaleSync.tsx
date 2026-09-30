import { useUserLocale } from "@app/hooks/useUserLocale";
import { useFeatureFlags, useWorkspace } from "@app/lib/auth/AuthContext";
import { i18n, loadCatalog } from "@app/lib/i18n/i18n";
import logger from "@app/logger/logger";
import { DEFAULT_LOCALE } from "@app/types/locale";
import { useEffect } from "react";

interface UserLocaleSyncProps {
  onReady?: () => void;
}

/**
 * @cc [owner:sfriquet,label:product] active-locale-follows-user-locale
 * Once its catalog has loaded, the active UI locale MUST be `DEFAULT_LOCALE` when the
 * `localisation` flag is disabled, and the `userLocale` of `useUserLocale` otherwise. While the
 * catalog loads or after it failed to load, `locale-switch-never-blocks-rendering` applies.
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
 * @cc [owner:sfriquet,label:react] ready-after-resolved-locale-load
 * `onReady` MUST be called once the catalog load of the resolved locale settles, whether it
 * succeeded or failed, and MUST NOT be called for a load whose locale is no longer the resolved one.
 */
export function UserLocaleSync({ onReady }: UserLocaleSyncProps) {
  const owner = useWorkspace();
  const { hasFeature } = useFeatureFlags();
  const hasLocalisation = hasFeature("localisation");
  const { userLocale } = useUserLocale({ owner });
  const locale = hasLocalisation ? userLocale : DEFAULT_LOCALE;

  // Syncs the external Lingui instance and the document language with the resolved locale.
  useEffect(() => {
    let isCurrent = true;
    loadCatalog(locale)
      .then((messages) => {
        if (isCurrent) {
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
  }, [locale, onReady]);

  return null;
}
