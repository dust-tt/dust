import { messages as defaultLocaleMessages } from "@app/locales/en-US/messages.po";
import type { CatalogLocale, SupportedLocale } from "@app/types/locale";
import { CATALOG_LOCALE_BY_LOCALE, DEFAULT_LOCALE } from "@app/types/locale";
import { assertNever } from "@app/types/shared/utils/assert_never";
import { loadSparkleCatalog } from "@dust-tt/sparkle/i18n";
import type { Messages } from "@lingui/core";
import { i18n } from "@lingui/core";

i18n.loadAndActivate({
  locale: DEFAULT_LOCALE,
  messages: defaultLocaleMessages,
});

async function loadFrontCatalog(locale: CatalogLocale): Promise<Messages> {
  switch (locale) {
    case "en-US":
      return defaultLocaleMessages;
    // Non-default catalogs are loaded on demand to keep them out of the main bundle.
    case "fr-FR":
      return (await import("@app/locales/fr-FR/messages.po")).messages;
    default:
      assertNever(locale);
  }
}

/**
 * @cc [owner:ykmsd,label:product] load-catalog-waits-for-sparkle
 * `loadCatalog` MUST resolve to front's messages only once sparkle's catalog of the same catalog
 * locale is loaded too, so that activating the locale switches front's and sparkle's text in the
 * same render (see `load-sparkle-catalog-before-provider`).
 */
export async function loadCatalog(locale: SupportedLocale): Promise<Messages> {
  const catalogLocale = CATALOG_LOCALE_BY_LOCALE[locale];
  const [, frontMessages] = await Promise.all([
    // Fails to compile if sparkle has no catalog for one of front's catalog locales.
    loadSparkleCatalog(catalogLocale),
    loadFrontCatalog(catalogLocale),
  ]);
  return frontMessages;
}

export { i18n };
