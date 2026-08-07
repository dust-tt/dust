import { sandboxApp } from "@front-api/middlewares/ctx";
import { sandboxAuth } from "@front-api/middlewares/sandbox_auth";

import claim from "./claim";

// Mounted at /api/v1/w/:wId/sandbox/poller. Only the pod's poller principal reaches these: a
// workload's invocation token is a different token kind and is refused here, and the poller token
// is refused everywhere else.
const app = sandboxApp();

app.use("*", sandboxAuth({ allowedTokenKinds: ["poller"] }));

app.route("/claim", claim);

export default app;
