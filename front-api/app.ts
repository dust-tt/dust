import { Hono } from "hono";

import { lazyMount } from "./lib/lazy_mount";
import { cors } from "./middlewares/cors";
import { requestLogger } from "./middlewares/request_logger";
import { unhandledErrorHandler } from "./middlewares/utils";

const API_MOUNT = "/api";

const apiApp = new Hono();

// `lazyMount` returns void in production (handlers register synchronously and
// sub-apps are imported on first request) and a Promise in test mode (sub-apps
// are imported eagerly so vi.mock'd modules are honored; see lazy_mount.ts).
// We collect the test-mode promises so we can `await` them before mounting
// apiApp on honoApp — Hono's `app.route(prefix, child)` snapshots child's
// route table at call time, so sub-app routes registered asynchronously after
// the mount call would not propagate.
const pendingMounts: Array<Promise<void> | void> = [];
const mount = (prefix: string, loader: () => Promise<Hono<any, any, any>>) => {
  pendingMounts.push(lazyMount(apiApp, API_MOUNT, prefix, loader));
};

// Static-prefix sub-apps. Each is imported on the first matching request
// (or eagerly in test mode).
mount("/healthz", () =>
  import("./routes/healthz").then((m) => m.healthzApp)
);
mount("/app-status", () =>
  import("./routes/app-status").then((m) => m.appStatusApp)
);
mount("/auth/login", () =>
  import("./routes/auth/login").then((m) => m.loginApp)
);
mount("/auth-context", () =>
  import("./routes/auth-context").then((m) => m.authContextApp)
);
mount("/create-new-workspace", () =>
  import("./routes/create-new-workspace").then((m) => m.createNewWorkspaceApp)
);
mount("/debug", () => import("./routes/debug").then((m) => m.default));
mount("/doc", () => import("./routes/doc").then((m) => m.default));
mount("/email", () => import("./routes/email").then((m) => m.default));
mount("/enrichment", () =>
  import("./routes/enrichment").then((m) => m.default)
);
mount("/geo", () => import("./routes/geo").then((m) => m.default));
mount("/invitations", () =>
  import("./routes/invitations").then((m) => m.invitationsApp)
);
mount("/kill", () => import("./routes/kill").then((m) => m.killApp));
mount("/login", () => import("./routes/login").then((m) => m.default));
mount("/lookup", () => import("./routes/lookup").then((m) => m.default));
mount("/metronome", () =>
  import("./routes/metronome").then((m) => m.default)
);
mount("/novu", () => import("./routes/novu").then((m) => m.default));
mount("/oauth", () => import("./routes/oauth").then((m) => m.default));
mount("/poke", () => import("./routes/poke").then((m) => m.default));
mount("/share", () => import("./routes/share").then((m) => m.default));
mount("/stripe", () => import("./routes/stripe").then((m) => m.default));
mount("/templates", () =>
  import("./routes/templates").then((m) => m.default)
);
mount("/t", () => import("./routes/t").then((m) => m.default));
mount("/user", () => import("./routes/user").then((m) => m.default));
mount("/workos", () => import("./routes/workos").then((m) => m.default));
mount("/workspace-lookup", () =>
  import("./routes/workspace-lookup").then((m) => m.workspaceLookupApp)
);

// Dynamic-prefix sub-apps. `join` is registered before `/w/:wId` so it does
// not inherit workspaceAuth (it is a public, unauthenticated endpoint).
mount("/w/:wId/join", () =>
  import("./routes/w/[wId]/join").then((m) => m.default)
);
mount("/w/:wId", () => import("./routes/w/[wId]").then((m) => m.default));
mount("/v1/w/:wId", () =>
  import("./routes/v1/w/[wId]").then((m) => m.default)
);
// Pre-stop uses a dynamic first segment (the secret) — register last so its
// `/:preStopSecret/prestop` shape doesn't shadow any literal-prefixed routes
// above.
mount("/:preStopSecret", () =>
  import("./routes/[preStopSecret]").then((m) => m.default)
);

// In test mode, wait for all eager mounts to register on apiApp before we
// attach apiApp to honoApp; otherwise honoApp would snapshot an empty
// apiApp. In production mode this resolves immediately.
await Promise.all(pendingMounts);

export const honoApp = new Hono();
honoApp.use("*", requestLogger);
honoApp.use("*", cors);
honoApp.route("/api", apiApp);
honoApp.onError(unhandledErrorHandler);
