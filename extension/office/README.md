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

Run the **Deploy Office add-ins** workflow from `main`. It builds and deploys
the `addins-dust-tt` Worker. Add-in releases are independent from `front`
deploys: the add-ins call the public API, like the Chrome extension, so they
must tolerate API version skew. Ship API changes before the add-in code that
needs them.

Roll back with `npx wrangler rollback --config extension/office/wrangler.toml`,
or by re-running the workflow on an earlier commit. This rolls back the whole
shared add-in bundle.

## First rollout

1. Deploy `front` to every production cell to allow `https://addins.dust.tt` in
   CORS.
2. Register the exact `https://addins.dust.tt/excel/auth.html` redirect URI in
   the production WorkOS application.
3. Run the **Deploy Office add-ins** workflow. Its first run creates the
   `addins-dust-tt` Worker; `workers.dev` and preview URLs are disabled.
4. Apply the `dust-infra` Terraform change that attaches `addins.dust.tt` to
   the Worker (DNS and TLS included).
5. Check the task pane, auth page, and manifest return 200 over HTTPS, asset URLs
   resolve under `/excel/assets/`, and a nonexistent asset returns 404. Verify
   headers, sign-in, region/cell switching, streaming, and a workbook tool in
   Excel on the web and desktop, sideloading the production manifest.

## Adding another Office host

Add its production build and manifest under `extension/platforms/<host>/` and
build it into `office/dist/<host>/` from `build:office`. Use `/<host>/` for its
production asset base and a callback beside its task pane.
Register that exact callback URL in WorkOS and extend `_headers` for its hashed
assets/auth page. No DNS or API CORS changes are required. PowerPoint and Word
applications are not implemented by this change.
