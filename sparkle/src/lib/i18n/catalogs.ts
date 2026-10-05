import type { Messages } from "@lingui/core";
import type { SparkleCatalogLocale } from "@sparkle/lib/i18n/locales";
import { SPARKLE_SOURCE_LOCALE } from "@sparkle/lib/i18n/locales";
import { messages as sourceLocaleMessages } from "@sparkle/locales/en-US/messages";

// Synchronous, so that a consumer can activate its source locale before the first render.
export const sparkleSourceLocaleMessages: Messages = sourceLocaleMessages;

const SPARKLE_CATALOG_LOADERS: Record<
  SparkleCatalogLocale,
  () => Promise<Messages>
> = {
  [SPARKLE_SOURCE_LOCALE]: async () => sourceLocaleMessages,
  // Non-source catalogs are loaded on demand to keep them out of the consumers' main bundles.
  "fr-FR": async () =>
    (await import("@sparkle/locales/fr-FR/messages")).messages,
};

/**
 * @cc [owner:ykmsd,label:product] load-sparkle-catalog-compiled
 * `loadSparkleCatalog` MUST resolve to the compiled sparkle messages of `locale`, keyed by message
 * id, which a consumer can merge into the messages it loads into its own Lingui instance.
 */
export function loadSparkleCatalog(
  locale: SparkleCatalogLocale
): Promise<Messages> {
  return SPARKLE_CATALOG_LOADERS[locale]();
}
