# Shared Office add-in hosting

`addins.dust.tt` serves static assets for Office add-ins. Excel lives at
`/excel/taskpane.html`, its sign-in callback at `/excel/auth.html`, and its
production manifest at `/excel/manifest.xml`. Future PowerPoint and Word builds
can live at `/powerpoint/` and `/word/` without another hostname or service.
These paths share a browser origin, not a security boundary; future add-ins must
be trusted equally. Office/WebView storage partitioning may still prevent
session sharing between applications.

The existing `office-addins.dust.tt` service is unrelated and is not changed.

## Build

From `extension/`, with dependencies, the SDK, and Sparkle already built:

````sh
set -a
source ../.github/configs/us-central1/.env.prod
set +a
npm run build:office
````

The production webpack build of each platform writes straight to
`office/dist/<platform>/`, including its production manifest as `manifest.xml`;
`build:office` then adds Cloudflare's `_headers`. The Excel production manifest
has a separate ID from the local development add-in. Local development still
uses `https://localhost:3014/taskpane.html` and `manifest.dev.xml`.

`wrangler.toml` serves exact `.html` paths, with no SPA fallback or automatic
HTML redirects. Missing files and not-yet-implemented platforms return 404.
HTML and manifests revalidate; hashed assets are immutable; the auth callback
is not cached. Do not set `X-Frame-Options: DENY` or `SAMEORIGIN`, since Office
on the web embeds the task pane.

## Deploy

The add-ins ship with production `front` deploys: check `deploy_office_addins`
in the **Deploy** workflow. While the image builds, it uploads a new
`addins-dust-tt` Worker version tagged with the commit, without promoting it.
Once front has rolled out to every selected cell, dust-infra dispatches back to
**Deploy SPA to production**, which promotes that exact version. A failed upload
fails the front deploy; a failed front rollout never promotes the add-ins.
`front-edge` never uploads them.

The add-ins call the public API, like the Chrome extension, so they must
tolerate API version skew. Since the add-in origin is global, use all cells for
releases that need new API behavior.

To roll back, run **Deploy SPA to production** with `app: addins` and the
`version_id` of an earlier version, found in Cloudflare's deployment history
(each version is tagged with its commit). This rolls back the whole shared
add-in bundle.

## First rollout

`deploy_office_addins` defaults to `false` until the Worker exists, since a
version upload fails on a missing Worker.

1. Deploy `front` to every production cell to allow `https://addins.dust.tt` in
   CORS.
2. Register the exact `https://addins.dust.tt/excel/auth.html` redirect URI in
   the production WorkOS application.
3. Bootstrap the Worker once from a `main` build (see Build above), with the
   Cloudflare deployment credentials:

   ````sh
   npx wrangler deploy --config extension/office/wrangler.toml
   ````

   `workers.dev` and preview URLs are disabled, so it is not reachable yet.
4. Apply the `dust-infra` Terraform change that attaches `addins.dust.tt` to
   the Worker (DNS and TLS included).
5. Check the task pane, auth page, and manifest return 200 over HTTPS, asset URLs
   resolve under `/excel/assets/`, and a nonexistent asset returns 404. Verify
   headers, sign-in, region/cell switching, streaming, and a workbook tool in
   Excel on the web and desktop, sideloading the production manifest.
6. Flip the `deploy_office_addins` default to `true` in
   `.github/workflows/deploy.yml`.

## Adding another Office host

Add its production build and manifest under `extension/platforms/<host>/` and
build it into `office/dist/<host>/` from `build:office`. Use `/<host>/` for its
production asset base and a callback beside its task pane.
Register that exact callback URL in WorkOS and extend `_headers` for its hashed
assets/auth page. No DNS or API CORS changes are required. PowerPoint and Word
applications are not implemented by this change.
