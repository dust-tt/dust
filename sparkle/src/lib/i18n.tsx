import { setupI18n } from "@lingui/core";
import { compileMessage } from "@lingui/message-utils/compileMessage";
import {
  type I18nContext,
  LinguiContext,
  Trans as LinguiTrans,
  type TransProps,
} from "@lingui/react";
import React, { useContext } from "react";

// Runtime targets of the Lingui macros in Sparkle (see `sparkle/lingui.config.ts`). Sparkle code
// imports the macros from `@lingui/react/macro` and `@lingui/core/macro`, never this module.

const fallbackI18n = setupI18n({
  locale: "en-US",
  messages: { "en-US": {} },
});
// Production builds of `@lingui/core` do not set a compiler: missing messages would then render
// their ICU source, `{count}` placeholders and plurals included.
fallbackI18n.setMessagesCompiler(compileMessage);

const FALLBACK_CONTEXT: I18nContext = {
  i18n: fallbackI18n,
  _: fallbackI18n._.bind(fallbackI18n),
  defaultComponent: undefined,
};

/**
 * @cc [owner:ykmsd,label:react;product] english-without-provider
 * Sparkle components MUST render without a Lingui `I18nProvider`. Without one, `useLingui` and
 * `Trans` MUST render the English source message with its placeholders and plurals resolved;
 * they MUST NOT throw, render a message id, or render ICU syntax. Under a provider, they MUST use
 * the provider's `i18n` instance.
 */
/**
 * @cc [owner:ykmsd,label:react;product] format-with-active-locale
 * Sparkle code that formats dates, times or numbers for display MUST pass
 * `useLingui().i18n.locale` as the locale. It MUST NOT hardcode a locale, omit it, or call a
 * locale-less `toLocale*String()`.
 */
export function useLingui(): I18nContext {
  // `@lingui/react`'s own hook throws outside production and returns null in production.
  return useContext(LinguiContext) ?? FALLBACK_CONTEXT;
}

export function Trans(props: TransProps) {
  const context = useContext(LinguiContext);
  if (context) {
    return <LinguiTrans {...props} />;
  }

  return (
    <LinguiContext.Provider value={FALLBACK_CONTEXT}>
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
export const i18n = fallbackI18n;
