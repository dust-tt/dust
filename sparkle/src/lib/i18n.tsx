import { type I18n, type Messages, setupI18n } from "@lingui/core";
import { compileMessage } from "@lingui/message-utils/compileMessage";
import {
  type I18nContext,
  LinguiContext,
  Trans as LinguiTrans,
  type TransProps,
} from "@lingui/react";
import enUS from "@sparkle/locales/en-US/messages.json";
import frFR from "@sparkle/locales/fr-FR/messages.json";
import React, { useContext } from "react";

// Runtime targets of the Lingui macros in Sparkle (see `sparkle/lingui.config.ts`). Sparkle code
// imports the macros from `@lingui/react/macro` and `@lingui/core/macro`, never this module.
//
// Sparkle ships its own compiled catalogs (`src/locales/{locale}/messages.json`, built by
// `npm run i18n:compile`), so an app never has to provide Sparkle's strings: it only sets the
// locale through its Lingui `I18nProvider`, and apps without Lingui get English.

const SOURCE_LOCALE = "en-US";

// `lingui compile` writes `{ messages }` JSON whose inferred shape is narrower than `Messages`.
function compiledCatalog(compiled: { messages: unknown }): Messages {
  return compiled.messages as Messages;
}

// One entry per locale of `sparkle/lingui.config.ts`.
const CATALOGS: Record<string, Messages> = {
  "en-US": compiledCatalog(enUS),
  "fr-FR": compiledCatalog(frFR),
};

/**
 * @cc [owner:ykmsd,label:react;product] catalog-locale-resolution
 * The catalog for a locale MUST be, in order: the catalog of that exact locale, else the first
 * catalog of the same language (`en-GB` MUST render the `en-US` catalog), else the `en-US` catalog.
 * The resolution MUST NOT throw for any locale string.
 */
function resolveCatalogLocale(locale: string): string {
  if (locale in CATALOGS) {
    return locale;
  }
  const language = locale.split("-")[0];
  const sameLanguageLocale = Object.keys(CATALOGS).find(
    (catalogLocale) => catalogLocale.split("-")[0] === language
  );
  return sameLanguageLocale ?? SOURCE_LOCALE;
}

const contextByLocale = new Map<string, I18nContext>();

function getSparkleContext(locale: string): I18nContext {
  const cached = contextByLocale.get(locale);
  if (cached) {
    return cached;
  }
  // The instance carries the requested locale (for date and number formatting) with the resolved
  // catalog's messages.
  const i18n: I18n = setupI18n({
    locale,
    messages: { [locale]: CATALOGS[resolveCatalogLocale(locale)] },
  });
  // Safety net for a message missing from the catalogs (a stale build): production builds of
  // `@lingui/core` do not set a compiler, and the English `message` kept in every descriptor
  // would then render its ICU source, `{count}` placeholders and plurals included.
  i18n.setMessagesCompiler(compileMessage);
  const context: I18nContext = {
    i18n,
    _: i18n._.bind(i18n),
    defaultComponent: undefined,
  };
  contextByLocale.set(locale, context);
  return context;
}

/**
 * @cc [owner:ykmsd,label:react;product] sparkle-catalog-follows-app-locale
 * `useLingui` and `Trans` MUST translate with Sparkle's own catalogs only, never the app's
 * messages. Under a Lingui `I18nProvider`, they MUST use the locale of the provider's `i18n`
 * instance (re-resolved whenever it changes); without a provider, they MUST use `en-US`.
 */
/**
 * @cc [owner:ykmsd,label:react;product] english-without-provider
 * Sparkle components MUST render without a Lingui `I18nProvider`. Without one, `useLingui` and
 * `Trans` MUST render the English source message with its placeholders and plurals resolved;
 * they MUST NOT throw, render a message id, or render ICU syntax.
 */
/**
 * @cc [owner:ykmsd,label:react;product] format-with-active-locale
 * Sparkle code that formats dates, times or numbers for display MUST pass
 * `useLingui().i18n.locale` as the locale. It MUST NOT hardcode a locale, omit it, or call a
 * locale-less `toLocale*String()`.
 */
export function useLingui(): I18nContext {
  // `@lingui/react`'s own hook throws outside production and returns null in production.
  const appContext = useContext(LinguiContext);
  return getSparkleContext(appContext?.i18n.locale ?? SOURCE_LOCALE);
}

export function Trans(props: TransProps) {
  // `@lingui/react`'s `Trans` reads the nearest `LinguiContext`: point it at Sparkle's catalog.
  const context = useLingui();
  return (
    <LinguiContext.Provider value={context}>
      <LinguiTrans {...props} />
    </LinguiContext.Provider>
  );
}

/**
 * @cc [owner:ykmsd,label:react;product] fallback-instance-only
 * `i18n` is the provider-less English instance, never the app's. It exists only as the import
 * target of the core macros: Sparkle code MUST NOT import it, nor call a core macro (`t`, or
 * `plural`/`select` outside a `t` template) that compiles to it.
 */
export const i18n = getSparkleContext(SOURCE_LOCALE).i18n;
