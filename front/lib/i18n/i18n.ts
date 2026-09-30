import { messages as defaultLocaleMessages } from "@app/locales/en-US/messages.po";
import type { CatalogLocale, SupportedLocale } from "@app/types/locale";
import {
  CATALOG_LOCALE_BY_LOCALE,
  DEFAULT_LOCALE,
  isSupportedLocale,
} from "@app/types/locale";
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

export function loadCatalog(locale: SupportedLocale): Promise<Messages> {
  return CATALOG_LOADERS[CATALOG_LOCALE_BY_LOCALE[locale]]();
}

export function getActiveLocale(): SupportedLocale {
  return isSupportedLocale(i18n.locale) ? i18n.locale : DEFAULT_LOCALE;
}

export { i18n };
