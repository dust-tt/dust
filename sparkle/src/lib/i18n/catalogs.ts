import type { I18n, Messages } from "@lingui/core";
import { setupI18n } from "@lingui/core";
import type { SparkleCatalogLocale } from "@sparkle/lib/i18n/locales";
import { SPARKLE_SOURCE_LOCALE } from "@sparkle/lib/i18n/locales";
import { assertNever } from "@sparkle/lib/internal_utils";
import { messages as sourceLocaleMessages } from "@sparkle/locales/en-US/messages";

// The locale `Intl` formats with when given none (the browser's).
function getRuntimeFormatLocale(): string {
  return new Intl.DateTimeFormat().resolvedOptions().locale;
}

// Lingui has one global `i18n` object, and it belongs to the app using sparkle (e.g. front). If
// sparkle used it too, sparkle could change the app's language and vice versa, and sparkle would
// show no text in apps that never set Lingui up. So sparkle creates its own objects: one per
// language and format locale, already loaded and set to them, and never changed afterwards.
// Switching locale means switching to another object, which makes React re-render.
function createI18n(
  locale: SparkleCatalogLocale,
  formatLocale: string,
  messages: Messages
): I18n {
  return setupI18n({
    locale,
    locales: [formatLocale],
    messages: { [locale]: messages },
  });
}

const i18nByKey = new Map<string, I18n>();

/**
 * @cc [owner:ykmsd,label:product] sparkle-i18n-formats-in-format-locale
 * An `I18n` returned for a `formatLocale` MUST format numbers, dates and the `number`, `date` and
 * `time` placeholders of messages in `formatLocale`, and in the runtime's default locale (the
 * browser's) when `formatLocale` is `undefined`, whatever its catalog locale. It MUST be the same
 * object for the same catalog and format locales, so that React only re-renders on a change.
 */
function getOrCreateI18n(
  locale: SparkleCatalogLocale,
  formatLocale: string | undefined,
  messages: Messages
): I18n {
  const resolvedFormatLocale = formatLocale ?? getRuntimeFormatLocale();
  const key = `${locale}:${resolvedFormatLocale}`;
  let i18n = i18nByKey.get(key);
  if (!i18n) {
    i18n = createI18n(locale, resolvedFormatLocale, messages);
    i18nByKey.set(key, i18n);
  }
  return i18n;
}

const loadedMessagesByLocale = new Map<SparkleCatalogLocale, Messages>([
  [SPARKLE_SOURCE_LOCALE, sourceLocaleMessages],
]);

// Synchronous, so that sparkle renders without a provider and before any catalog loads.
export const sourceLocaleI18n = getOrCreateI18n(
  SPARKLE_SOURCE_LOCALE,
  undefined,
  sourceLocaleMessages
);

async function importCatalog(locale: SparkleCatalogLocale): Promise<Messages> {
  switch (locale) {
    // Unreachable (`loadedMessagesByLocale` is seeded with it), kept for exhaustiveness.
    case "en-US":
      return sourceLocaleMessages;
    // Non-source catalogs are loaded on demand to keep them out of the consumers' main bundles.
    case "fr-FR":
      return (await import("@sparkle/locales/fr-FR/messages")).messages;
    default:
      assertNever(locale);
  }
}

async function loadMessages(locale: SparkleCatalogLocale): Promise<Messages> {
  const loadedMessages = loadedMessagesByLocale.get(locale);
  if (loadedMessages) {
    return loadedMessages;
  }

  const messages = await importCatalog(locale);
  // A concurrent load of the same locale may have finished first: keep its messages.
  const keptMessages = loadedMessagesByLocale.get(locale) ?? messages;
  loadedMessagesByLocale.set(locale, keptMessages);
  return keptMessages;
}

export function getLoadedSparkleI18n(
  locale: SparkleCatalogLocale,
  formatLocale: string | undefined
): I18n | undefined {
  const messages = loadedMessagesByLocale.get(locale);
  return messages ? getOrCreateI18n(locale, formatLocale, messages) : undefined;
}

export async function loadSparkleI18n(
  locale: SparkleCatalogLocale,
  formatLocale: string | undefined
): Promise<I18n> {
  return getOrCreateI18n(locale, formatLocale, await loadMessages(locale));
}

export async function preloadSparkleLocale(
  locale: SparkleCatalogLocale
): Promise<void> {
  await loadMessages(locale);
}
