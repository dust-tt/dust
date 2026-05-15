# [front-api] Coding Rules

Shared rules (GEN1-GEN13, SEC1-SEC2, ERR1-ERR2) in the root `CODING_RULES.md`
apply automatically. TypeScript rules in `front/CODING_RULES.md` also apply,
since `front-api` shares the same TS environment and reaches into `front`
internals via the `@app/*` path map.

This file documents rules and patterns specific to `front-api`.

`front-api` is the Hono-based service that incrementally takes over routes
from `front` (Next.js). The strangler dispatch lives in
`front-api/server.ts`: it checks `isHonoRoute` from `front-api/app.ts`;
matched requests go to Hono, the rest fall through to Next.

## ROUTING

### [API1] Route file layout follows the URL hierarchy

Hono is not file-system routed — the directory tree is purely organizational.
But we keep it aligned with URL prefixes for discoverability:

```
front-api/routes/
  healthz.ts                # GET /api/healthz
  w/
    index.ts                # workspaceApp (mounted at /api/w/:wId), applies workspaceAuth
    spaces/
      index.ts              # spacesApp (mounted at /api/w/:wId/spaces) — GET /, POST /
      mcp.ts                # mcpApp (mounted at /api/w/:wId/spaces/:spaceId/mcp)
      ...
  v1/
    w/
      index.ts              # publicWorkspaceApp, applies publicApiAuth
      spaces.ts             # public-API spaces handlers
```

One file per **logical sub-resource**, not per HTTP endpoint. All handlers
for a sub-resource (GET list, POST create, GET by id, PATCH, DELETE, etc.)
live in the same file. Split further (e.g.
`data_source_views/index.ts` + `data_source_views/tables.ts`) only when a
single file gets large.

Do not mirror Next's `[wId]/[spaceId]/index.ts` deep tree — Hono routes are
explicit, the tree adds nesting without benefit.

### [API2] Register Hono-served routes in `HONO_ROUTES`

A route only takes effect when its pattern is added to `HONO_ROUTES` in
`front-api/app.ts`. Without it, `isHonoRoute` returns false and the request
falls through to Next — even if the Hono route is defined.

```ts
const HONO_ROUTES: HonoRoute[] = [
  { pattern: "/api/w/:wId/spaces", methods: ["GET", "POST"] },
  { pattern: "/api/w/:wId/spaces/:spaceId/mcp/available", methods: ["GET"] },
  // …
];
```

`OPTIONS` is auto-added by the regex builder, so CORS preflights for any
registered pattern are handled by Hono.

### [API3] Compose sub-apps with `app.route()`

A new sub-resource is wired in by adding one `.route()` call in the parent
sub-app:

```ts
// front-api/routes/w/spaces/index.ts
spacesApp.route("/:spaceId/mcp", mcpApp);
spacesApp.route("/:spaceId/data_source_views", dsvApp);
```

Path parameters from the parent mount (`:wId`, `:spaceId`) are propagated
into the child sub-app's context (`c.req.param("spaceId")` keeps working).

## MIDDLEWARE

### [API4] Apply auth middleware once, at the sub-app boundary

`workspaceAuth` and `publicApiAuth` are applied once at the workspace
sub-app level, not per-route:

```ts
// front-api/routes/w/index.ts
workspaceApp.use("*", workspaceAuth);
workspaceApp.route("/spaces", spacesApp);
```

All routes below inherit it. The resolved `Authenticator` is available via
`c.get("auth")`.

### [API5] Resource-fetching middleware is applied per-handler

Resource middlewares like `spaceResource` carry permission options
(`requireCanRead`, `requireCanWrite`, etc.) that vary per endpoint. Apply
them on the individual handler, not on the sub-app:

```ts
mcpApp.get(
  "/available",
  spaceResource({ requireCanRead: true }),
  async (c) => {
    const space = c.get("space");
    // …
  }
);
```

Do not `mcpApp.use("*", spaceResource({...}))` — sibling handlers in the
same sub-app may need different permission levels.

## VALIDATION

### [API6] Validate request input with `validate(target, schema)`

`front-api/middleware/validator.ts` wraps `@hono/zod-validator` so failures
produce our standard `{ error: { type, message } }` shape. Use it for any
target (`json`, `query`, `param`, `header`, `cookie`, `form`):

```ts
spacesApp.post(
  "/",
  validate("json", PostSpaceRequestBodySchema),
  async (c) => {
    const body = c.req.valid("json"); // typed by inference
    // …
  }
);
```

Do not call `c.req.json()` + `safeParse` manually in handlers — that's what
the wrapper exists to eliminate.

## ERRORS

### [API7] Use the standard error shape

All error responses follow `{ error: { type, message } }` to match what the
Next handlers produce via `apiError`. For dynamic status codes carried in
`APIErrorWithStatusCode` (e.g. when forwarding a `Result.Err`), use the
`jsonApiError(c, err)` helper — it centralizes the
`number → ContentfulStatusCode` cast in one place with a comment.

## DEPENDENCIES

### [API8] Avoid Next types in front-api code

`NextApiRequest` / `NextApiResponse` should not appear in new code. New
middleware reads what it needs from Hono's `Context` directly
(`c.req.header(...)`, `c.req.param(...)`, `c.req.raw.headers`).

Known exception: the bridge in `workspace_auth.ts`, which still constructs
a Next-shaped `req`/`res` to call the legacy `getSession(req, res)`. That
will go away when `getSession` is refactored to take an I/O abstraction.

The strangler entry in `server.ts` keeps `import next from "next"` — that
disappears when Next is fully retired.
