import { messages as defaultLocaleMessages } from "@app/locales/en-US/messages.po";
import type { CatalogLocale, SupportedLocale } from "@app/types/locale";
import { CATALOG_LOCALE_BY_LOCALE, DEFAULT_LOCALE } from "@app/types/locale";
import {
  loadSparkleCatalog,
  sparkleSourceLocaleMessages,
} from "@dust-tt/sparkle/i18n";
import type { Messages } from "@lingui/core";
import { i18n } from "@lingui/core";

// Front's message wins when both catalogs define the same id (the same English message).
const withSparkleMessages = (
  sparkleMessages: Messages,
  frontMessages: Messages
): Messages => ({ ...sparkleMessages, ...frontMessages });

i18n.loadAndActivate({
  locale: DEFAULT_LOCALE,
  messages: withSparkleMessages(
    sparkleSourceLocaleMessages,
    defaultLocaleMessages
  ),
});

const FRONT_CATALOG_LOADERS: Record<CatalogLocale, () => Promise<Messages>> = {
  "en-US": async () => defaultLocaleMessages,
  // Non-default catalogs are loaded on demand to keep them out of the main bundle.
  "fr-FR": async () =>
    (await import("@app/locales/fr-FR/messages.po")).messages,
};

/**
 * @cc [owner:ykmsd,label:product] catalog-includes-sparkle-messages
 * `loadCatalog` MUST resolve to the messages of the catalog of `locale` merged with the sparkle
 * catalog of the same locale, front's message winning when both define the same id, and MUST
 * reject if either catalog fails to load. The messages activated at module load MUST be built the
 * same way for `DEFAULT_LOCALE`.
 */
export async function loadCatalog(locale: SupportedLocale): Promise<Messages> {
  const catalogLocale = CATALOG_LOCALE_BY_LOCALE[locale];
  const [sparkleMessages, frontMessages] = await Promise.all([
    // Fails to compile if sparkle has no catalog for one of front's catalog locales.
    loadSparkleCatalog(catalogLocale),
    FRONT_CATALOG_LOADERS[catalogLocale](),
  ]);
  return withSparkleMessages(sparkleMessages, frontMessages);
}

export { i18n };
