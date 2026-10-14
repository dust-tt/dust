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
npm run test:office
npm run build:office
````

CI also supplies the existing public Datadog client token and Virtuoso license.
`office/dist` contains only production assets, the production manifest, and
Cloudflare's `_headers`. The Excel production manifest has a separate ID from
the local development add-in. Local development still uses
`https://localhost:3014/taskpane.html` and `manifest.dev.xml`.

`wrangler.toml` serves exact `.html` paths, with no SPA fallback or automatic
HTML redirects. Missing files and not-yet-implemented platforms return 404.
HTML and manifests revalidate; hashed assets are immutable; the auth callback
is not cached. Do not set `X-Frame-Options: DENY` or `SAMEORIGIN`, since Office
on the web embeds the task pane.

## First rollout

Normal front deployments remain unchanged until the `dust` repository variable
`OFFICE_ADDINS_ENABLED` is set to `true`. Do not enable it before bootstrapping.

1. Merge this change and deploy `front` to every production cell to allow
   `https://addins.dust.tt` in CORS. Leave the hosting gate disabled.
2. Register the exact `https://addins.dust.tt/excel/auth.html` redirect URI in
   the production WorkOS application. This change does not alter the sign-in
   mechanism or introduce development auth proxies.
3. Build production assets from the merged commit, using the environment above,
   then bootstrap the new Worker from the repository root using the existing
   Cloudflare deployment credentials:

   ````sh
   npx wrangler deploy --config extension/office/wrangler.toml
   ````

   This initializes `addins-dust-tt`. It does not claim a custom domain;
   `workers.dev` and preview URLs are disabled. Subsequent releases use version
   upload/promotion, not this bootstrap command.
4. Apply the companion `dust-infra` Terraform change after reviewing its plan.
   It attaches `addins.dust.tt` to `addins-dust-tt` and manages DNS/TLS. No
   separate CNAME, Pages project, or Kubernetes release is needed.
5. Check the task pane, auth page, and manifest return 200 over HTTPS, asset URLs
   resolve under `/excel/assets/`, and a nonexistent asset returns 404. Verify
   headers, sign-in, region/cell switching, streaming, and a workbook tool in
   Excel on the web and desktop. Add the production manifest by sideloading.
6. Set `OFFICE_ADDINS_ENABLED=true` on the `dust` GitHub repository.

## Subsequent deployments and rollback

With the gate enabled, **Deploy** builds/uploads add-ins alongside production
`front`, unless its `deploy_office_addins` input is unchecked. The API deployment
waits for a successful upload. Its existing success callback promotes that exact
Worker version only after all selected cells complete their rollout. Since the
add-in origin is global, use all cells for releases requiring new API behavior.
`front-edge` never uploads or promotes this production add-in.

The existing **Deploy SPA to production** workflow accepts `app=addins` and an
explicit Worker version UUID for manual promotion or rollback. Obtain the old
version from Cloudflare deployment history and promote it at 100%; this rolls
back the entire shared add-in asset bundle. Reverting the API alone does not
roll back the add-in. Disabling the repository gate stops future coordinated
uploads but does not remove the current deployment.

The **Upload Office add-ins to Cloudflare** workflow can also upload a main
build without promoting it. A failed upload prevents that front deployment;
a failed API rollout does not promote the uploaded version. Promotion failures
are reported in the deployment Slack thread.

## Adding another Office host

Add its production build and manifest under `extension/platforms/<host>/` and
include it in `build:office` and `packageOfficeAssets`' platform list. Use
`/<host>/` for its production asset base and a callback beside its task pane.
Register that exact callback URL in WorkOS and extend `_headers` for its hashed
assets/auth page. No DNS or API CORS changes are required. PowerPoint and Word
applications are not implemented by this change.
