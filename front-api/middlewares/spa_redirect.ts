import config from "@app/lib/api/config";
import type { MiddlewareHandler } from "hono";

// Paths served by the main SPA app (front-spa) — redirect these to the SPA
// origin when they reach this Hono server.
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
 * Browser paths served by the separate SPA apps (front-spa, poke) sometimes
 * reach this origin (e.g. front-edge.dust.tt) — 302-redirect them to the
 * appropriate SPA origin so the user lands on the right app.
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
