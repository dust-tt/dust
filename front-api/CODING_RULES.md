# [front-api] Coding Rules

Shared rules (GEN, SEC and ERR) in the root `CODING_RULES.md` apply
automatically. TypeScript rules in `front/CODING_RULES.md` also apply,
since `front-api` shares the same TS environment and reaches into `front`
internals via the `@app/*` path map.

This file documents rules and patterns specific to `front-api`.

`front-api` is the Hono service that serves all HTTP traffic. `server.ts`
boots `honoApp` from `app.ts` on `@hono/node-server`, and `routes/` holds
every handler.

`front` is a library workspace (`lib`, `types`, `logger`, `components`) plus
the Temporal workers and the migrations. The dependency is one-way:
`front-api` reaches into `front` via `@app/*`, never the reverse.

## ROUTING

### [API1] One file per route; mirror the URL layout exactly

`front-api/routes/<path>.ts` maps 1:1 to the `/api/<path>` URL, including
dynamic segments (`[wId]`, `[spaceId]`, etc.) as literal directory names. The
path mapping is deterministic.

```
front-api/routes/
  healthz.ts                                       # /api/healthz
  w/
    [wId]/
      index.ts                                     # mounts children, applies workspaceAuth
      models.ts                                    # /api/w/:wId/models
      providers/
        index.ts                                   # /api/w/:wId/providers
      spaces/
        index.ts                                   # /api/w/:wId/spaces — GET /, POST /
        [spaceId]/
          index.ts                                 # mounts /:spaceId children
          leave.ts                                 # /api/w/:wId/spaces/:spaceId/leave
          mcp/
            available.ts                           # /api/w/:wId/spaces/:spaceId/mcp/available
          ...
  v1/
    w/
      [wId]/
        index.ts                                   # applies publicApiAuth
        spaces/
          index.ts                                 # /api/v1/w/:wId/spaces
```

**One file per URL, one route per file at `/`.** A leaf lives at
`front-api/routes/<path>.ts` and registers its handlers under `"/"` (the
parent mount owns the path segment). GET/POST/PATCH/DELETE on the **same
URL** stay together in one file; only different URLs split into different
files.

Each leaf exports `export default app`:

```ts
// front-api/routes/w/[wId]/spaces/[spaceId]/leave.ts
const app = new Hono();
app.post("/", withSpace({ requireCanReadOrAdministrate: true }), ...);
export default app;
```

### [API2] Each directory has an `index.ts` that mounts its children

The directory tree is composed via per-directory `index.ts` files. Each
`index.ts` does one or both of:

- Mount children via `app.route("/segment", child)`.
- Apply directory-scoped middleware (e.g. resource fetch that all routes in
  the directory need — see [API5]).

```ts
// front-api/routes/w/[wId]/spaces/[spaceId]/index.ts
const app = new Hono();
app.route("/leave", leave);
app.route("/mcp", mcp);
app.route("/data_source_views", dataSourceViews);
// ...
export default app;
```

**Registration order matters** when two sibling routes share a prefix and
one is a literal while the other is a param — e.g. `/tables/search` must be
mounted before `/tables/:tableId`, otherwise the param route swallows
"search" as an id. Hono's router scans in registration order.

### [API3] Mounting is the single source of truth — no separate route list

A route is reachable only because a parent mounted it, up to the top-level
mounts in `front-api/app.ts`. There is no route manifest to keep in sync:
adding a file and mounting it is the whole registration step.

Root-level mount order in `app.ts` follows the same literal-before-param rule
as [API2], and the exceptions are commented there — e.g. `/w/:wId/join` is
mounted before `/w/:wId` so it does not inherit `workspaceAuth`, and the
`/:preStopSecret` sub-app is mounted last so its dynamic first segment does
not shadow the literal-prefixed routes above it.

## MIDDLEWARE

### [API4] Apply auth middleware once, at the sub-app boundary

`workspaceAuth` and `publicApiAuth` are applied once at the workspace
sub-app level (the `[wId]/index.ts` mount file), not per-route:

```ts
// front-api/routes/w/[wId]/index.ts
const app = new Hono();
app.use("*", workspaceAuth);
app.route("/spaces", spaces);
// ...
export default app;
```

All routes below inherit it. The resolved `Authenticator` is available via
`c.get("auth")`.

The same pattern applies for any directory-scoped resource fetch — e.g.
`routes/w/[wId]/assistant/skills/[sId]/index.ts` fetches the `SkillResource`
once and stashes it on `c` so every route below can read it from
`c.get("skill")`.

**Public or own-auth routes nested under an authed sub-app.** When a route must
*not* inherit the parent's catch-all — a public endpoint, or one with its own
auth scheme — but its URL sits under a path owned by an authed sub-app, mount it
as its own sub-app **registered before** the authed parent. Hono scans in
registration order ([API1]): the earlier, terminal handler wins and the catch-all
never runs. Registered after, it would silently inherit the parent's auth.

```ts
// front-api/app.ts — join is public, so it must precede the workspace app.
apiApp.route("/w/:wId/join", workspaceJoinApp); // no auth
apiApp.route("/w/:wId", workspaceApp);          // app.use("*", workspaceAuth())
```

Lock every such exemption: (a) a posture test proving the route uses its own
scheme (or no auth), not the parent catch-all, and (b) an entry in the
`front-api/app.test.ts` tripwire, which fails CI when a top-level mount is added
or changed without a posture classification.

Reviewer: if a PR mounts a sub-app before an authed parent — or pulls a route out
to a separate, earlier mount — require both the posture test and the tripwire
entry before approving. If a PR adds a new top-level mount, require its
classification in the manifest.

### [API5] Resource-fetching middleware is applied per-handler when options vary

Resource-loading middlewares like `withSpace` carry permission options
(`requireCanRead`, `requireCanWrite`, etc.) that vary per endpoint. Apply
them on the individual handler, not on the parent's `index.ts`:

```ts
// front-api/routes/w/[wId]/spaces/[spaceId]/mcp/available.ts
const app = new Hono();
app.get("/", withSpace({ requireCanRead: true }), async (ctx) => {
  const space = ctx.get("space");
  // …
});
export default app;
```

Lift the middleware to the parent `index.ts` only when **every** route in the
subtree uses the exact same options (e.g. `routes/w/[wId]/assistant/skills/[sId]/index.ts`,
where the skill fetch and `canWrite` check are identical for all children).

## VALIDATION

### [API6] Validate request input with `validate(target, schema)`

`front-api/middlewares/validator.ts` wraps `@hono/zod-validator` so failures
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

### [API7] Always emit error responses through `apiError(c, ...)`

All error responses must go through `apiError(c, err, error?)` from
`@front-api/middlewares/utils`. It produces the standard
`{ error: { type, message } }` body plus the logging, dd-trace span tags, and
statsd `api_errors.count` increment. Calling `c.json({ error: ... }, status)`
directly skips that observability and is not allowed.

```ts
// BAD — bypasses logging / tracing / statsd
return c.json(
  {
    error: {
      type: "invalid_request_error",
      message: `Too many ids provided. Maximum is ${MAX}.`,
    },
  },
  400
);

// GOOD
return apiError(c, {
  status_code: 400,
  api_error: {
    type: "invalid_request_error",
    message: `Too many ids provided. Maximum is ${MAX}.`,
  },
});
```

When forwarding an underlying exception, pass it as the third argument so
its message and stack are captured in the log instead of the synthetic one.

`apiError` also handles the case where a `Result.Err` carries an
`APIErrorWithStatusCode` directly — pass it through verbatim. The
`number → ContentfulStatusCode` cast is centralized in the helper.

Reviewer: if you see `c.json({ error: ... }, status)` in a handler, require
the author to switch to `apiError(c, ...)`.

## IMPORTS

### [API8] Use `@front-api/*` for self-references; `@app/*` for `front/`

The path tree is deeply nested, so relative imports across the tree get long
fast. Use the `@front-api/*` alias for anything inside `front-api/` itself
(middleware, app, helpers), and the existing `@app/*` alias for reaching
into `front/`:

```ts
// front-api/routes/w/[wId]/spaces/[spaceId]/data_source_views/[dsvId]/tables/search.ts
import { validate } from "@front-api/middlewares/validator";        // self
import { withSpace } from "@front-api/middlewares/with_space";
import { CoreAPI } from "@app/types/core/core_api";                // front
```

Both aliases are configured in `tsconfig.json` and `vite.config.mjs`.
Relative imports (`./sibling`, `../parent`) are still fine for files
adjacent in the tree, but anything reaching across more than one segment
should use the alias.

## SESSIONS

### [API9] Read the request through Hono's `Context`

Middleware and handlers read what they need from Hono's `Context` directly
(`c.req.header(...)`, `c.req.param(...)`, `c.req.raw.headers`) — never
through a framework-specific request/response pair.

For cookie-based session resolution, call
`getWorkOSSessionWithSetCookies(workOSSessionCookie)` from
`@app/lib/api/workos/user`. It returns `{ session, setCookies }` — emit each
`setCookies` value with `c.header("Set-Cookie", cookie, { append: true })`,
as `front-api/middlewares/session_resolution.ts` does.
