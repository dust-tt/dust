// Reads the homepage hero A/B experiment variant that `marketing` stored in a
// shared `.dust.tt` cookie when the visitor was served the homepage. Lets
// `front` attribute the sign-up completion — which happens after the WorkOS
// redirect chain, on the far side of the marketing/app boundary — back to the
// variant the visitor saw.
//
// The cookie is written by `marketing/lib/experiments/hero_variant_cookie.ts`;
// keep the name in sync. The value is one of the marketing-side variant keys
// ("control" | "collaboration" | ...); `front` treats it as an opaque string
// tracking property and does not need the union type.
export const HERO_VARIANT_COOKIE = "_dust_hv";

export function readHeroVariantFromDocumentCookie(): string | null {
  if (typeof document === "undefined") {
    return null;
  }
  const prefix = `${HERO_VARIANT_COOKIE}=`;
  const match = document.cookie.split("; ").find((c) => c.startsWith(prefix));
  return match ? match.slice(prefix.length) : null;
}
