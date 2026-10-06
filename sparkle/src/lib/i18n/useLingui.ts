import type { I18nContext } from "@lingui/react";
import { sourceLocaleI18n } from "@sparkle/lib/i18n/catalogs";
import { createContext, useContext } from "react";

// Sparkle uses its own context instead of @lingui/react's `I18nProvider`. If it shared the
// consumer's `i18n` instance, sparkle's catalogs and locale changes would leak into the app (and
// the reverse).
//
// Passing `sourceLocaleI18n.t` unbound is safe: Lingui's `I18n` constructor sets
// `this.t = this._.bind(this)`.
export const SparkleI18nContext = createContext<I18nContext>({
  i18n: sourceLocaleI18n,
  _: sourceLocaleI18n.t,
});

export function useLingui(): I18nContext {
  return useContext(SparkleI18nContext);
}
