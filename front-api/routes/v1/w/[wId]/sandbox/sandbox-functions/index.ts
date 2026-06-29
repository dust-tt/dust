import { sandboxApp } from "@front-api/middlewares/ctx";

import result from "./result";

// Mounted at /api/v1/w/:wId/sandbox/sandbox-functions. sandboxAuth is applied
// by the parent sandbox sub-app, so ctx.get("auth") and ctx.get("sandboxClaims")
// are always available here.
const app = sandboxApp();

app.route("/result", result);

export default app;
