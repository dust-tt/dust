import type { Messages } from "@lingui/core";
import type { SparkleCatalogLocale } from "@sparkle/lib/i18n/locales";
import { assertNever } from "@sparkle/lib/internal_utils";
import { messages as sourceLocaleMessages } from "@sparkle/locales/en-US/messages";

// Synchronous, so that a consumer can activate its source locale before the first render.
export const sparkleSourceLocaleMessages: Messages = sourceLocaleMessages;

/**
 * @cc [owner:ykmsd,label:product] load-sparkle-catalog-compiled
 * `loadSparkleCatalog` MUST resolve to the compiled sparkle messages of `locale`, keyed by message
 * id, which a consumer can merge into the messages it loads into its own Lingui instance.
 */
export async function loadSparkleCatalog(
  locale: SparkleCatalogLocale
): Promise<Messages> {
  switch (locale) {
    case "en-US":
      return sourceLocaleMessages;
    // Non-source catalogs are loaded on demand to keep them out of the consumers' main bundles.
    case "fr-FR":
      return (await import("@sparkle/locales/fr-FR/messages")).messages;
    default:
      assertNever(locale);
  }
}
