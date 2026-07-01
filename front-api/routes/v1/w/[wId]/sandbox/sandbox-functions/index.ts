import { sandboxApp } from "@front-api/middlewares/ctx";
import { sandboxAuth } from "@front-api/middlewares/sandbox_auth";

import result from "./result";

// Mounted at /api/v1/w/:wId/sandbox/sandbox-functions.
const app = sandboxApp();

app.use("*", sandboxAuth({ tokenKind: "function_invocation" }));

app.route("/result", result);

export default app;
