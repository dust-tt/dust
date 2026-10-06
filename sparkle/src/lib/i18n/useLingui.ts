import type { I18n } from "@lingui/core";
import type { I18nContext } from "@lingui/react";
import { sourceLocaleI18n } from "@sparkle/lib/i18n/catalogs";
import { createContext, useContext } from "react";

export function toI18nContext(i18n: I18n): I18nContext {
  return { i18n, _: i18n.t.bind(i18n) };
}

// Sparkle's own context, independent of the consumer's `I18nProvider`: the consumer picks sparkle's
// locale with `SparkleI18nProvider`.
export const SparkleI18nContext = createContext<I18nContext>(
  toI18nContext(sourceLocaleI18n)
);

/**
 * @cc [owner:ykmsd,label:product;react] use-lingui-works-without-provider
 * Inside a `SparkleI18nProvider`, `useLingui` MUST return the context of the nearest one, so that
 * sparkle renders in the locale the consumer passed and re-renders when it changes. It MUST NOT
 * read the consumer's `LinguiContext`. Without a provider, it MUST NOT throw and MUST return a
 * context that renders sparkle's compiled `SPARKLE_SOURCE_LOCALE` catalog.
 */
// Target of the `useLingui` macro (see `runtimeConfigModule` in `sparkle/lingui.config.ts`):
// components import `useLingui` from `@lingui/react/macro`, never from this module.
export function useLingui(): I18nContext {
  return useContext(SparkleI18nContext);
}
