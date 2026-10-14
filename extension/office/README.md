# Shared Office add-in hosting

`addins.dust.tt` serves static assets for Office add-ins. Excel lives at
`/excel/taskpane.html`, its sign-in callback at `/excel/auth.html`, and its
production manifest at `/excel/manifest.xml`. Future PowerPoint and Word builds
can live at `/powerpoint/` and `/word/` without another hostname or service.
These paths share a browser origin, not a security boundary; future add-ins must
be trusted equally. Office/WebView storage partitioning may still prevent
session sharing between applications.

The existing `office-addins.dust.tt` service is unrelated and is not changed.

## Adding another Office host

Add its production build and manifest under `extension/platforms/<host>/` and
build it into `office/dist/<host>/` from `build:office`. Use `/<host>/` for its
production asset base and a callback beside its task pane.
Register that exact callback URL in WorkOS and extend `_headers` for its hashed
assets/auth page. No DNS or API CORS changes are required. PowerPoint and Word
applications are not implemented by this change.
