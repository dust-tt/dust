import config from "@app/lib/api/config";
import type { MiddlewareHandler } from "hono";

// Paths served by the main SPA app (front-spa) — redirect these to the SPA
// origin. Mirrors `SPA_PATH_PREFIXES` in `front/middleware.ts`.
const SPA_PATH_PREFIXES = [
  "/w",
  "/invite-choose",
  "/no-workspace",
  "/sso-enforced",
  "/logout",
  "/login-error",
  "/maintenance",
  "/oauth",
  "/share",
  "/email",
];

function isSpaPath(pathname: string): boolean {
  return SPA_PATH_PREFIXES.some(
    (prefix) => pathname === prefix || pathname.startsWith(`${prefix}/`)
  );
}

function isPokePath(pathname: string): boolean {
  return pathname === "/poke" || pathname.startsWith("/poke/");
}

/**
 * Mirrors the SPA / poke redirects in `front/middleware.ts` (the Next.js Edge
 * middleware) for requests served natively by Hono. Browser paths served by
 * the separate SPA apps (front-spa, poke) reach this origin (e.g.
 * front-edge.dust.tt) and must be 302-redirected to the appropriate SPA origin.
 */
export const spaRedirect: MiddlewareHandler = async (ctx, next) => {
  // `ctx.req.path` is the parsed pathname without the cost of building a URL.
  const pathname = ctx.req.path;

  // SPA redirects never apply to API routes, which are by far the hottest path.
  // Bail out before any further checks (and before parsing the URL for its query
  // string) so /api requests don't pay for these checks on every request.
  if (pathname.startsWith("/api/")) {
    return next();
  }

  // Redirect /poke/* to the poke SPA app (the poke server handles its own auth).
  if (isPokePath(pathname)) {
    const { search } = new URL(ctx.req.url);
    const pathAfterPoke = pathname.slice("/poke".length); // leading slash or empty
    return ctx.redirect(
      `${config.getPokeAppUrl()}${pathAfterPoke}${search}`,
      302
    );
  }

  // Redirect SPA paths to the main SPA app.
  if (isSpaPath(pathname)) {
    const { search } = new URL(ctx.req.url);
    return ctx.redirect(`${config.getAppUrl()}${pathname}${search}`, 302);
  }

  await next();
};
