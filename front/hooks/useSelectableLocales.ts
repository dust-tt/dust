import { useFeatureFlags } from "@app/lib/auth/AuthContext";
import type { SupportedLocale } from "@app/types/locale";
import { LOCALE_FEATURE_FLAGS, SUPPORTED_LOCALES } from "@app/types/locale";

export function useSelectableLocales(): SupportedLocale[] {
  const { hasFeature } = useFeatureFlags();

  return SUPPORTED_LOCALES.filter((locale) =>
    hasFeature(LOCALE_FEATURE_FLAGS[locale])
  );
}
