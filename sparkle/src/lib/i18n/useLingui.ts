import type { I18nContext } from "@lingui/react";
import { sourceLocaleI18n } from "@sparkle/lib/i18n/catalogs";
import { createContext, useContext } from "react";

// Sparkle's own context, independent of the consumer's `I18nProvider`: the consumer picks sparkle's
// locale with `SparkleI18nProvider`. `_` needs no binding: `I18n` binds `t` in its constructor.
export const SparkleI18nContext = createContext<I18nContext>({
  i18n: sourceLocaleI18n,
  _: sourceLocaleI18n.t,
});

export function useLingui(): I18nContext {
  return useContext(SparkleI18nContext);
}
