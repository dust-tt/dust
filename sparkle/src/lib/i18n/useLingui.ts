import { setupI18n } from "@lingui/core";
import type { I18nContext } from "@lingui/react";
import { LinguiContext } from "@lingui/react";
import { SPARKLE_SOURCE_LOCALE } from "@sparkle/lib/i18n/locales";
import { messages as sourceLocaleMessages } from "@sparkle/locales/en-US/messages";
import { useContext } from "react";

const fallbackI18n = setupI18n({
  locale: SPARKLE_SOURCE_LOCALE,
  messages: { [SPARKLE_SOURCE_LOCALE]: sourceLocaleMessages },
});

const FALLBACK_CONTEXT: I18nContext = {
  i18n: fallbackI18n,
  _: fallbackI18n.t.bind(fallbackI18n),
};

/**
 * @cc [owner:ykmsd,label:product;react] use-lingui-works-without-provider
 * Inside an `I18nProvider`, `useLingui` MUST return the context of the nearest provider, so that
 * sparkle renders in the consumer's active locale and re-renders when it changes. Without a provider,
 * it MUST NOT throw and MUST return a context that renders sparkle's compiled
 * `SPARKLE_SOURCE_LOCALE` catalog.
 */
// Target of the `useLingui` macro (see `runtimeConfigModule` in `sparkle/lingui.config.ts`):
// components import `useLingui` from `@lingui/react/macro`, never from this module.
export function useLingui(): I18nContext {
  return useContext(LinguiContext) ?? FALLBACK_CONTEXT;
}
