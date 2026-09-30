import { messages as defaultLocaleMessages } from "@app/locales/en-US/messages.po";
import type { SupportedLocale } from "@app/types/locale";
import { DEFAULT_LOCALE } from "@app/types/locale";
import type { Messages } from "@lingui/core";
import { i18n } from "@lingui/core";

i18n.loadAndActivate({
  locale: DEFAULT_LOCALE,
  messages: defaultLocaleMessages,
});

const CATALOG_LOADERS: Record<SupportedLocale, () => Promise<Messages>> = {
  "en-US": async () => defaultLocaleMessages,
  // Non-default catalogs are loaded on demand to keep them out of the main bundle.
  "fr-FR": async () =>
    (await import("@app/locales/fr-FR/messages.po")).messages,
};

export function loadCatalog(locale: SupportedLocale): Promise<Messages> {
  return CATALOG_LOADERS[locale]();
}

export { i18n };
