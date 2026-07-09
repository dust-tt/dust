import type { HeroVariantKey } from "@marketing/lib/experiments/hero_experiment";
import { isHeroVariantKey } from "@marketing/lib/experiments/hero_experiment";
import { serverCookieDomainForHost } from "@marketing/lib/utils/anonymous_id";

// Cross-subdomain cookie carrying the hero A/B variant the visitor was served on
// the homepage. The two conversion endpoints that live off the homepage — the
// contact form (`/home/contact`) and, after the WorkOS sign-up redirect chain,
// `front`'s onboarding — read it to attribute their completion back to the
// variant. Mirrors `_dust_aid`: scoped to `.dust.tt` in production so it
// survives dust.tt -> app.dust.tt / eu.dust.tt.
//
// The matching reader on the `front` side lives in
// `front/lib/experiments/hero_variant_cookie.ts`; keep the name in sync.
export const HERO_VARIANT_COOKIE = "_dust_hv";

// Bounded to a conversion-attribution window rather than `_dust_aid`'s full
// year: the variant should only tag conversions that plausibly stem from the
// homepage visit that set it.
const HERO_VARIANT_MAX_AGE_SECONDS = 60 * 60 * 24 * 30; // 30 days.

function buildHeroVariantCookieStringForDomain(
  variant: HeroVariantKey,
  domain: string | null
): string {
  const domainPart = domain ? `; domain=${domain}` : "";
  return `${HERO_VARIANT_COOKIE}=${variant}; path=/${domainPart}; SameSite=Lax; Secure; max-age=${HERO_VARIANT_MAX_AGE_SECONDS}`;
}

// Build a `Set-Cookie` string for the hero variant from the server. Derives the
// cookie scope from the request host, exactly like `_dust_aid`, so the value is
// readable back on `/home/contact` and on `*.dust.tt` after sign-up redirects.
export function buildHeroVariantServerCookieString(
  variant: HeroVariantKey,
  host: string | undefined
): string {
  return buildHeroVariantCookieStringForDomain(
    variant,
    serverCookieDomainForHost(host)
  );
}

function parseHeroVariantFromCookieString(
  cookies: string
): HeroVariantKey | null {
  const prefix = `${HERO_VARIANT_COOKIE}=`;
  const match = cookies.split("; ").find((c) => c.startsWith(prefix));
  if (!match) {
    return null;
  }
  const value = match.slice(prefix.length);
  return isHeroVariantKey(value) ? value : null;
}

export function readHeroVariantFromDocumentCookie(): HeroVariantKey | null {
  if (typeof document === "undefined") {
    return null;
  }
  return parseHeroVariantFromCookieString(document.cookie);
}
