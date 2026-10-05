import { messages as defaultLocaleMessages } from "@app/locales/en-US/messages.po";
import type { CatalogLocale, SupportedLocale } from "@app/types/locale";
import { CATALOG_LOCALE_BY_LOCALE, DEFAULT_LOCALE } from "@app/types/locale";
import { assertNever } from "@app/types/shared/utils/assert_never";
import {
  loadSparkleCatalog,
  sparkleSourceLocaleMessages,
} from "@dust-tt/sparkle/i18n";
import type { Messages } from "@lingui/core";
import { i18n } from "@lingui/core";

i18n.loadAndActivate({
  locale: DEFAULT_LOCALE,
  // Front's message wins when both catalogs define the same id (the same English message).
  messages: { ...sparkleSourceLocaleMessages, ...defaultLocaleMessages },
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

export async function loadCatalog(locale: SupportedLocale): Promise<Messages> {
  const catalogLocale = CATALOG_LOCALE_BY_LOCALE[locale];
  const [sparkleMessages, frontMessages] = await Promise.all([
    // Fails to compile if sparkle has no catalog for one of front's catalog locales.
    loadSparkleCatalog(catalogLocale),
    loadFrontCatalog(catalogLocale),
  ]);
  return { ...sparkleMessages, ...frontMessages };
}

export { i18n };
