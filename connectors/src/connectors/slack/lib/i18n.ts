import { existsSync, readFileSync } from "node:fs";
import path from "node:path";
import type { CatalogLocale, SupportedLocale } from "@connectors/types/locale";
import {
  CATALOG_LOCALE_BY_LOCALE,
  DEFAULT_LOCALE,
} from "@connectors/types/locale";
import type { I18n, Messages } from "@lingui/core";
import { setupI18n } from "@lingui/core";
import { formatter } from "@lingui/format-po";
import { compileMessage } from "@lingui/message-utils/compileMessage";

/**
 * @cc [owner:Nils-Fedrigo,label:product] locales-dir-from-cwd
 * The Slack catalogs are read from `locales/` under the working directory: every connectors process
 * MUST run with the `connectors` package directory as its working directory.
 */
const LOCALES_DIR = path.join(process.cwd(), "locales");

async function loadMessages(catalogLocale: CatalogLocale): Promise<Messages> {
  const filename = path.join(LOCALES_DIR, catalogLocale, "messages.po");
  // `i18n:extract` deletes catalogs without messages: every message renders its English text.
  if (!existsSync(filename)) {
    return {};
  }
  const catalog = await formatter().parse(readFileSync(filename, "utf8"), {
    locale: catalogLocale,
    sourceLocale: DEFAULT_LOCALE,
    filename,
  });
  const messages: Messages = {};
  for (const [id, entry] of Object.entries(catalog)) {
    if (!entry.obsolete && entry.translation) {
      messages[id] = entry.translation;
    }
  }
  return messages;
}

const i18nByLocale = new Map<SupportedLocale, Promise<I18n>>();

/**
 * @cc [owner:Nils-Fedrigo,label:product;concurrency] slack-i18n-per-locale
 * MUST return an `I18n` instance dedicated to `locale`, whose locale never changes after creation:
 * the bot answers users with different locales concurrently in one process. It MUST render the
 * messages of the `CATALOG_LOCALE_BY_LOCALE[locale]` catalog, and messages without a translation
 * there MUST render their English text, with placeholders interpolated.
 */
export function getSlackI18n(locale: SupportedLocale): Promise<I18n> {
  let instance = i18nByLocale.get(locale);
  if (!instance) {
    instance = loadMessages(CATALOG_LOCALE_BY_LOCALE[locale]).then((messages) =>
      setupI18n({ locale, messages: { [locale]: messages } })
        // Catalogs are parsed from `.po` files, not precompiled, and the message ids are the
        // English text: both need compiling at runtime to interpolate placeholders.
        .setMessagesCompiler(compileMessage)
    );
    i18nByLocale.set(locale, instance);
  }
  return instance;
}
