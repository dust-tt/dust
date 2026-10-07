import { messages as defaultLocaleMessages } from "@app/locales/en-US.catalog";
import type { CatalogLocale, SupportedLocale } from "@app/types/locale";
import { CATALOG_LOCALE_BY_LOCALE, DEFAULT_LOCALE } from "@app/types/locale";
import type { Messages } from "@lingui/core";
import { i18n, setupI18n } from "@lingui/core";

i18n.loadAndActivate({
  locale: DEFAULT_LOCALE,
  messages: defaultLocaleMessages,
});

/**
 * @cc [owner:sfriquet,label:product] stays-default-locale
 * `defaultLocaleI18n` MUST only ever load and activate `DEFAULT_LOCALE`, so that callers can render
 * descriptors in `DEFAULT_LOCALE` whatever the active locale of the global `i18n`.
 */
export const defaultLocaleI18n = setupI18n({
  locale: DEFAULT_LOCALE,
  messages: { [DEFAULT_LOCALE]: defaultLocaleMessages },
});

const CATALOG_LOADERS: Record<CatalogLocale, () => Promise<Messages>> = {
  "en-US": async () => defaultLocaleMessages,
  // Non-default catalogs are loaded on demand to keep them out of the main bundle.
  "fr-FR": async () => (await import("@app/locales/fr-FR.catalog")).messages,
};

export function loadCatalog(locale: SupportedLocale): Promise<Messages> {
  return CATALOG_LOADERS[CATALOG_LOCALE_BY_LOCALE[locale]]();
}

export { i18n };
