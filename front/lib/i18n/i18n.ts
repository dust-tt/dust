import { messages as defaultLocaleMessages } from "@app/locales/en-US/messages.po";
import type { CatalogLocale, SupportedLocale } from "@app/types/locale";
import { CATALOG_LOCALE_BY_LOCALE, DEFAULT_LOCALE } from "@app/types/locale";
import type { Messages } from "@lingui/core";
import { i18n } from "@lingui/core";

i18n.loadAndActivate({
  locale: DEFAULT_LOCALE,
  messages: defaultLocaleMessages,
});

const CATALOG_LOADERS: Record<CatalogLocale, () => Promise<Messages>> = {
  "en-US": async () => defaultLocaleMessages,
  // Non-default catalogs are loaded on demand to keep them out of the main bundle.
  "fr-FR": async () =>
    (await import("@app/locales/fr-FR/messages.po")).messages,
};

/**
 * @cc [owner:ykmsd,label:architecture] i18n-module-without-sparkle
 * This module is bundled into front-api, which does not depend on `@dust-tt/sparkle`: it MUST NOT
 * import sparkle, directly or transitively. Sparkle's catalogs are loaded by sparkle itself (see
 * `SparkleLocaleProvider`).
 */
export function loadCatalog(locale: SupportedLocale): Promise<Messages> {
  return CATALOG_LOADERS[CATALOG_LOCALE_BY_LOCALE[locale]]();
}

export { i18n };
