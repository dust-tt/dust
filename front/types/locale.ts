import type { WhitelistableFeature } from "@app/types/shared/feature_flags";

export const SUPPORTED_LOCALES = ["en-US", "en-GB", "fr-FR", "de-DE"] as const;

export type SupportedLocale = (typeof SUPPORTED_LOCALES)[number];

export const DEFAULT_LOCALE: SupportedLocale = "en-US";

/**
 * @cc [owner:ykmsd,label:product] catalog-locales-added-to-sparkle-and-viz
 * A locale added to `CATALOG_LOCALES` MUST also be added, with its catalog, to
 * `SPARKLE_CATALOG_LOCALES` (sparkle/src/lib/i18n/locales.ts) and `VIZ_CATALOG_LOCALES`
 * (viz/app/lib/i18n/locales.ts).
 */
/**
 * @cc [owner:sfriquet,label:product] catalog-locale-has-style-guide
 * Every `CATALOG_LOCALES` entry MUST have a style guide at
 * `.claude/skills/dust-translate/references/{locale}.md`, listed in the `dust-translate` skill:
 * adding a locale without written translation rules is a violation.
 */
export const CATALOG_LOCALES = [
  "en-US",
  "en-GB",
  "fr-FR",
  "de-DE",
] as const satisfies readonly SupportedLocale[];

export type CatalogLocale = (typeof CATALOG_LOCALES)[number];

/**
 * @cc [owner:sfriquet,label:product] fallback-catalog-renders-fallback-messages
 * A catalog locale listed here MUST render the message of the catalog locale it maps to wherever
 * its own `msgstr` is empty, and MUST NOT be required to translate every message.
 */
/**
 * @cc [owner:sfriquet,label:product] fallback-locales-match-sparkle-and-viz
 * `SPARKLE_CATALOG_FALLBACK_LOCALES` (sparkle/src/lib/i18n/locales.ts) and
 * `VIZ_CATALOG_FALLBACK_LOCALES` (viz/app/lib/i18n/locales.ts) MUST hold the same entries as
 * `CATALOG_FALLBACK_LOCALES`, so that a locale falls back the same way in every catalog.
 */
/**
 * @cc [owner:sfriquet,label:product] en-gb-catalog-holds-only-differences
 * An `en-GB` `msgstr` MUST be empty unless the British text differs from the `en-US` one per
 * `.claude/skills/dust-translate/references/en-GB.md`, and an `en-US` message using a spelling that
 * guide lists MUST have a non-empty `en-GB` `msgstr` (equal to the message to keep it unchanged,
 * such as a quoted third-party label).
 */
export const CATALOG_FALLBACK_LOCALES: Partial<
  Record<CatalogLocale, CatalogLocale>
> = {
  "en-GB": "en-US",
};

export const PSEUDO_LOCALE = "pseudo";

export type PseudoLocale = typeof PSEUDO_LOCALE;

export const CATALOG_LOCALE_BY_LOCALE: Record<SupportedLocale, CatalogLocale> =
  {
    "en-US": "en-US",
    "en-GB": "en-GB",
    "fr-FR": "fr-FR",
    "de-DE": "de-DE",
  };

// Native names: a user who cannot read the current UI language must still recognize their own.
export const LOCALE_LABELS: Record<SupportedLocale, string> = {
  "en-US": "English (US)",
  "en-GB": "English (UK)",
  "fr-FR": "Français",
  "de-DE": "Deutsch",
};

/**
 * @cc [owner:sfriquet,label:product] flagged-locale-selectable-only-with-flag
 * A locale listed here MUST NOT be offered by the user or workspace locale pickers, nor accepted
 * as the workspace locale by the workspace settings API, unless its feature flag is enabled for
 * the current workspace.
 */
export const LOCALE_FEATURE_FLAGS: Partial<
  Record<SupportedLocale, WhitelistableFeature>
> = {
  "de-DE": "localisation_de-DE",
};

export const USER_LOCALE_METADATA_KEY = "locale";

export function isSupportedLocale(value: unknown): value is SupportedLocale {
  return SUPPORTED_LOCALES.some((locale) => locale === value);
}
