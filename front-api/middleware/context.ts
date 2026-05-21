import type { Authenticator } from "@app/lib/auth";
import type { SessionWithUser } from "@app/lib/iam/provider";

/**
 * Cross-cutting variables that downstream handlers can read via `c.get(...)`
 * after the corresponding auth middleware has run.
 *
 * We centralize the `declare module "hono"` augmentation here rather than
 * scattering one per middleware. The individual middlewares (`workspaceAuth`,
 * `sessionAuth`, `pokeAuth`, `publicApiAuth`) use `createMiddleware<{Variables}>`
 * for their own internal typing — that's the part that matters for catching
 * bugs at the middleware-implementation level. This global augmentation only
 * exists so route handlers don't need to type their `Hono` instance with the
 * full Env (we have 250+ sub-apps; threading the type through each is not
 * worth the churn).
 *
 * Resource-scoped variables (`space`, `dataSource`, `dataSourceView`, `skill`)
 * keep their own per-middleware declarations because they apply to a narrower
 * set of routes.
 */
declare module "hono" {
  interface ContextVariableMap {
    auth: Authenticator;
    session: SessionWithUser;
  }
}

export {};
