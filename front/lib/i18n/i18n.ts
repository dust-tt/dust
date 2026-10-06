import { messages as defaultLocaleMessages } from "@app/locales/en-US/messages.po";
import type { SupportedLocale } from "@app/types/locale";
import { CATALOG_LOCALE_BY_LOCALE, DEFAULT_LOCALE } from "@app/types/locale";
import { assertNever } from "@app/types/shared/utils/assert_never";
import type { Messages } from "@lingui/core";
import { i18n } from "@lingui/core";

i18n.loadAndActivate({
  locale: DEFAULT_LOCALE,
  messages: defaultLocaleMessages,
});

export async function loadCatalog(locale: SupportedLocale): Promise<Messages> {
  const catalogLocale = CATALOG_LOCALE_BY_LOCALE[locale];
  switch (catalogLocale) {
    case "en-US":
      return defaultLocaleMessages;
    // Non-default catalogs are loaded on demand to keep them out of the main bundle.
    case "fr-FR":
      return (await import("@app/locales/fr-FR/messages.po")).messages;
    default:
      assertNever(catalogLocale);
  }
}

export { i18n };
