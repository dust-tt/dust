import type { I18n, Messages } from "@lingui/core";
import { setupI18n } from "@lingui/core";
import type { SparkleCatalogLocale } from "@sparkle/lib/i18n/locales";
import { SPARKLE_SOURCE_LOCALE } from "@sparkle/lib/i18n/locales";
import { assertNever } from "@sparkle/lib/internal_utils";
import { messages as sourceLocaleMessages } from "@sparkle/locales/en-US/messages";

// Lingui has one global `i18n` object, and it belongs to the app using sparkle (e.g. front). If
// sparkle used it too, sparkle could change the app's language and vice versa, and sparkle would
// show no text in apps that never set Lingui up. So sparkle creates its own objects: one per
// language, already loaded and set to that language, and never changed afterwards. Switching
// language means switching to another object, which makes React re-render.
function createI18n(locale: SparkleCatalogLocale, messages: Messages): I18n {
  return setupI18n({ locale, messages: { [locale]: messages } });
}

// Synchronous, so that sparkle renders without a provider and before any catalog loads.
export const sourceLocaleI18n = createI18n(
  SPARKLE_SOURCE_LOCALE,
  sourceLocaleMessages
);

const loadedI18nByLocale = new Map<SparkleCatalogLocale, I18n>([
  [SPARKLE_SOURCE_LOCALE, sourceLocaleI18n],
]);

async function importCatalog(locale: SparkleCatalogLocale): Promise<Messages> {
  switch (locale) {
    // Unreachable (`loadedI18nByLocale` is seeded with it), kept for exhaustiveness.
    case "en-US":
      return sourceLocaleMessages;
    // Non-source catalogs are loaded on demand to keep them out of the consumers' main bundles.
    case "fr-FR":
      return (await import("@sparkle/locales/fr-FR/messages")).messages;
    default:
      assertNever(locale);
  }
}

export function getLoadedSparkleI18n(
  locale: SparkleCatalogLocale
): I18n | undefined {
  return loadedI18nByLocale.get(locale);
}

export async function loadSparkleI18n(
  locale: SparkleCatalogLocale
): Promise<I18n> {
  const loadedI18n = loadedI18nByLocale.get(locale);
  if (loadedI18n) {
    return loadedI18n;
  }

  const messages = await importCatalog(locale);
  // A concurrent load of the same locale may have finished first: keep its instance.
  const i18n = loadedI18nByLocale.get(locale) ?? createI18n(locale, messages);
  loadedI18nByLocale.set(locale, i18n);
  return i18n;
}

// Returns nothing so that consumers can't get, and mutate, sparkle's `I18n` instances.
export async function preloadSparkleLocale(
  locale: SparkleCatalogLocale
): Promise<void> {
  await loadSparkleI18n(locale);
}
