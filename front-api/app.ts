import { Hono } from "hono";

import { lazyMount } from "./lib/lazy_mount";
import { cors } from "./middlewares/cors";
import { requestLogger } from "./middlewares/request_logger";
import { unhandledErrorHandler } from "./middlewares/utils";

const API_MOUNT = "/api";

const apiApp = new Hono();

// Static-prefix sub-apps. Each is imported on the first matching request.
lazyMount(apiApp, API_MOUNT, "/healthz", () =>
  import("./routes/healthz").then((m) => m.healthzApp)
);
lazyMount(apiApp, API_MOUNT, "/app-status", () =>
  import("./routes/app-status").then((m) => m.appStatusApp)
);
lazyMount(apiApp, API_MOUNT, "/auth/login", () =>
  import("./routes/auth/login").then((m) => m.loginApp)
);
lazyMount(apiApp, API_MOUNT, "/auth-context", () =>
  import("./routes/auth-context").then((m) => m.authContextApp)
);
lazyMount(apiApp, API_MOUNT, "/create-new-workspace", () =>
  import("./routes/create-new-workspace").then((m) => m.createNewWorkspaceApp)
);
lazyMount(apiApp, API_MOUNT, "/debug", () =>
  import("./routes/debug").then((m) => m.default)
);
lazyMount(apiApp, API_MOUNT, "/doc", () =>
  import("./routes/doc").then((m) => m.default)
);
lazyMount(apiApp, API_MOUNT, "/email", () =>
  import("./routes/email").then((m) => m.default)
);
lazyMount(apiApp, API_MOUNT, "/enrichment", () =>
  import("./routes/enrichment").then((m) => m.default)
);
lazyMount(apiApp, API_MOUNT, "/geo", () =>
  import("./routes/geo").then((m) => m.default)
);
lazyMount(apiApp, API_MOUNT, "/invitations", () =>
  import("./routes/invitations").then((m) => m.invitationsApp)
);
lazyMount(apiApp, API_MOUNT, "/kill", () =>
  import("./routes/kill").then((m) => m.killApp)
);
lazyMount(apiApp, API_MOUNT, "/login", () =>
  import("./routes/login").then((m) => m.default)
);
lazyMount(apiApp, API_MOUNT, "/lookup", () =>
  import("./routes/lookup").then((m) => m.default)
);
lazyMount(apiApp, API_MOUNT, "/metronome", () =>
  import("./routes/metronome").then((m) => m.default)
);
lazyMount(apiApp, API_MOUNT, "/novu", () =>
  import("./routes/novu").then((m) => m.default)
);
lazyMount(apiApp, API_MOUNT, "/oauth", () =>
  import("./routes/oauth").then((m) => m.default)
);
lazyMount(apiApp, API_MOUNT, "/poke", () =>
  import("./routes/poke").then((m) => m.default)
);
lazyMount(apiApp, API_MOUNT, "/share", () =>
  import("./routes/share").then((m) => m.default)
);
lazyMount(apiApp, API_MOUNT, "/stripe", () =>
  import("./routes/stripe").then((m) => m.default)
);
lazyMount(apiApp, API_MOUNT, "/templates", () =>
  import("./routes/templates").then((m) => m.default)
);
lazyMount(apiApp, API_MOUNT, "/t", () =>
  import("./routes/t").then((m) => m.default)
);
lazyMount(apiApp, API_MOUNT, "/user", () =>
  import("./routes/user").then((m) => m.default)
);
lazyMount(apiApp, API_MOUNT, "/workos", () =>
  import("./routes/workos").then((m) => m.default)
);
lazyMount(apiApp, API_MOUNT, "/workspace-lookup", () =>
  import("./routes/workspace-lookup").then((m) => m.workspaceLookupApp)
);

// Dynamic-prefix sub-apps. `join` is registered before `/w/:wId` so it does
// not inherit workspaceAuth (it is a public, unauthenticated endpoint).
lazyMount(apiApp, API_MOUNT, "/w/:wId/join", () =>
  import("./routes/w/[wId]/join").then((m) => m.default)
);
lazyMount(apiApp, API_MOUNT, "/w/:wId", () =>
  import("./routes/w/[wId]").then((m) => m.default)
);
lazyMount(apiApp, API_MOUNT, "/v1/w/:wId", () =>
  import("./routes/v1/w/[wId]").then((m) => m.default)
);
// Pre-stop uses a dynamic first segment (the secret) — register last so its
// `/:preStopSecret/prestop` shape doesn't shadow any literal-prefixed routes
// above.
lazyMount(apiApp, API_MOUNT, "/:preStopSecret", () =>
  import("./routes/[preStopSecret]").then((m) => m.default)
);

export const honoApp = new Hono();
honoApp.use("*", requestLogger);
honoApp.use("*", cors);
honoApp.route("/api", apiApp);
honoApp.onError(unhandledErrorHandler);
