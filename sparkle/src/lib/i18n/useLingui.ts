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

export function useLingui(): I18nContext {
  return useContext(SparkleI18nContext);
}
