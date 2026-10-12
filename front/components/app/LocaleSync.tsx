import { setFormatLocale } from "@app/lib/i18n/format";
import { i18n, loadCatalog } from "@app/lib/i18n/i18n";
import type { LocaleOverride } from "@app/lib/i18n/locale_override";
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
  locale: LocaleOverride;
  formatLocale: SupportedLocale | undefined;
  onReady?: () => void;
}

/**
 * @cc [owner:sfriquet,label:product] activates-locale-after-format-locale
 * Once the catalog of `locale` has loaded, `formatLocale` MUST be set with `setFormatLocale`, then
 * `locale` MUST be activated as the UI locale and set as the document language.
 */
/**
 * @cc [owner:sfriquet,label:product;react] locale-switch-never-blocks-rendering
 * Rendering MUST NOT wait for the catalog of `locale`: the previously active locale stays active
 * until the new catalog is loaded. A catalog that finishes loading after `locale` changed again
 * MUST NOT be activated, and a failed load MUST leave the active locale unchanged. Loading a
 * catalog is a background sync exempt from `async-network-loading-state`: it MUST NOT show a
 * loading state of its own.
 */
/**
 * @cc [owner:ykmsd,label:product] locale-activated-with-sparkle-catalog
 * `locale` MUST NOT be activated before the sparkle locale `getSparkleLocale` maps it to is
 * preloaded, so that front and sparkle switch locale in the same render. A failed sparkle preload
 * counts as a failed catalog load.
 */
/**
 * @cc [owner:sfriquet,label:react] ready-after-resolved-locale-load
 * `onReady` MUST be called once the catalog load of `locale` settles, whether it succeeded or
 * failed, and MUST NOT be called for a load whose locale is no longer `locale`.
 */
export function LocaleSync({ locale, formatLocale, onReady }: LocaleSyncProps) {
  // Syncs the format locale, the external Lingui instance and the document language with the
  // locale.
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
