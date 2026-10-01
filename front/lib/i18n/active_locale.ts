import type { SupportedLocale } from "@app/types/locale";
import { DEFAULT_LOCALE, isSupportedLocale } from "@app/types/locale";
import { i18n } from "@lingui/core";

export function getActiveLocale(): SupportedLocale {
  return isSupportedLocale(i18n.locale) ? i18n.locale : DEFAULT_LOCALE;
}
