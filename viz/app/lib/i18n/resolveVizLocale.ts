import type { VizCatalogLocale } from "@viz/app/lib/i18n/locales";
import {
  VIZ_CATALOG_LOCALES,
  VIZ_SOURCE_LOCALE,
} from "@viz/app/lib/i18n/locales";

// Exact tag first (case-insensitive), then same language: `en-AU` and `en` read `en-US`, `fr-CA`
// reads `fr-FR`.
function matchCatalogLocale(tag: string): VizCatalogLocale | undefined {
  const normalized = tag.trim().toLowerCase();
  const language = normalized.split("-")[0];
  return (
    VIZ_CATALOG_LOCALES.find((locale) => locale.toLowerCase() === normalized) ??
    VIZ_CATALOG_LOCALES.find(
      (locale) => locale.split("-")[0].toLowerCase() === language
    )
  );
}

// Tags of an `Accept-Language` header, in header order. Browsers list tags most preferred first, so
// q-values are ignored. `*` is dropped.
function parseAcceptLanguage(header: string): string[] {
  return header
    .split(",")
    .map((entry) => entry.split(";")[0].trim())
    .filter((tag) => tag !== "" && tag !== "*");
}

/**
 * @cc [owner:ykmsd,label:product] viz-locale-resolution-order
 * The resolved locale MUST be, in order: the catalog locale matching `localeParam` (the `?locale=`
 * front passes), else the catalog locale matching the first `acceptLanguage` tag, in header order,
 * that has one, else `VIZ_SOURCE_LOCALE`. A tag matches its exact catalog locale, else the first catalog
 * locale of the same language (`en-AU` → `en-US`). Missing or unmatched inputs MUST fall through,
 * never fail.
 */
export function resolveVizLocale({
  localeParam,
  acceptLanguage,
}: {
  localeParam: string | undefined;
  acceptLanguage: string | null;
}): VizCatalogLocale {
  const fromParam = localeParam ? matchCatalogLocale(localeParam) : undefined;
  if (fromParam) {
    return fromParam;
  }

  for (const tag of parseAcceptLanguage(acceptLanguage ?? "")) {
    const locale = matchCatalogLocale(tag);
    if (locale) {
      return locale;
    }
  }

  return VIZ_SOURCE_LOCALE;
}
