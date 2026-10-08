import type { I18nContext } from "@lingui/react";
import { sourceLocaleI18n } from "@sparkle/lib/i18n/catalogs";
import { createContext, useContext } from "react";

interface SparkleI18nContextValue extends I18nContext {
  // Kept out of `i18n`: Lingui picks plural forms with the locales it formats with, which must stay
  // the catalog's (e.g. `en-GB` renders the `en-US` catalog with English plural rules).
  formatLocale: string | undefined;
}

// Sparkle's own context, independent of the consumer's `I18nProvider`: the consumer picks sparkle's
// locale with `SparkleI18nProvider`. If it shared the consumer's `i18n` instance, sparkle's catalogs
// and locale changes would leak into the app (and the reverse).
//
// Passing `sourceLocaleI18n.t` unbound is safe: Lingui's `I18n` constructor sets
// `this.t = this._.bind(this)`.
export const SparkleI18nContext = createContext<SparkleI18nContextValue>({
  i18n: sourceLocaleI18n,
  _: sourceLocaleI18n.t,
  formatLocale: undefined,
});

export function useLingui(): SparkleI18nContextValue {
  return useContext(SparkleI18nContext);
}
