import type { SupportedLocale } from "@app/lib/i18n/locales";
import { messages as enMessages } from "@app/locales/en/messages.po";
import { i18n } from "@lingui/core";

// The English catalog is bundled statically and activated at module load: Lingui renders nothing
// until a locale is active, and production builds strip the English text from the source, so the
// English catalog is what makes English render at all.
i18n.load("en", enMessages);
i18n.activate("en");

// Other locales are compiled on import by `@lingui/vite-plugin` and split into their own chunk,
// so only the active language is downloaded.
const CATALOG_LOADERS: Record<
  Exclude<SupportedLocale, "en">,
  () => Promise<{ messages: typeof enMessages }>
> = {
  fr: () => import("@app/locales/fr/messages.po"),
};

/**
 * @cc [owner:sfriquet,label:product] activate-loads-catalog-before-switch
 * `activateLocale(locale)` MUST load the catalog for `locale` before activating it, so the UI
 * never renders raw message ids for a locale whose catalog is not loaded. If loading fails, the
 * previously active locale MUST remain active and the error MUST propagate to the caller.
 */
export async function activateLocale(locale: SupportedLocale): Promise<void> {
  if (locale === "en") {
    i18n.activate("en");
    return;
  }
  const { messages } = await CATALOG_LOADERS[locale]();
  i18n.load(locale, messages);
  i18n.activate(locale);
}

export { i18n };
