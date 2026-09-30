export const SUPPORTED_LOCALES = ["en-US", "fr-FR"] as const;

export type SupportedLocale = (typeof SUPPORTED_LOCALES)[number];

export const DEFAULT_LOCALE: SupportedLocale = "en-US";

// Native names: a user who cannot read the current UI language must still recognize their own.
export const LOCALE_LABELS: Record<SupportedLocale, string> = {
  "en-US": "English (US)",
  "fr-FR": "Français",
};

export const USER_LOCALE_METADATA_KEY = "locale";

export function isSupportedLocale(value: unknown): value is SupportedLocale {
  return SUPPORTED_LOCALES.some((locale) => locale === value);
}
