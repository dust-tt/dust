import { sandboxApp } from "@front-api/middlewares/ctx";
import { sandboxAuth } from "@front-api/middlewares/sandbox_auth";

import actions from "./actions";

// Mounted at /api/v1/w/:wId/sandbox. This sub-tree is mounted before
// `publicWorkspaceApp` in `routes/v1/index.ts` so it does not inherit
// `publicApiAuth`. Every route below authenticates via `sandboxAuth`, which
// accepts only sandbox tokens and exposes the verified token claims on `ctx`.
const app = sandboxApp();

app.use("*", sandboxAuth);

app.route("/actions", actions);

export default app;
