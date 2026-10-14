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

interface UseLocaleSyncProps {
  // The locale to activate.
  locale: LocaleOverride;
  // The locale to format numbers and dates in, `undefined` for the browser's.
  formatLocale: SupportedLocale | undefined;
  onReady?: () => void;
}

/**
 * @cc [owner:ykmsd,label:product] locale-activated-with-sparkle-catalog
 * `locale` MUST NOT be activated before the sparkle locale `getSparkleLocale` maps it to is
 * preloaded, so that front and sparkle switch locale in the same render. A failed sparkle preload
 * counts as a failed catalog load.
 */
/**
 * @cc [owner:sfriquet,label:product] format-locale-set-before-activation
 * Once the catalog of `locale` has loaded, the format locale set with `setFormatLocale` MUST be
 * `formatLocale`, and it MUST be set before `locale` is activated.
 */
/**
 * @cc [owner:sfriquet,label:react] ready-after-resolved-locale-load
 * `onReady` MUST be called once the catalog load of `locale` settles, whether it succeeded or
 * failed, and MUST NOT be called for a load whose locale is no longer the current `locale`.
 */
export function useLocaleSync({
  locale,
  formatLocale,
  onReady,
}: UseLocaleSyncProps): void {
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
}
