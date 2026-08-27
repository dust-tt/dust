import { sandboxApp } from "@front-api/middlewares/ctx";

import actions from "./actions";
import filesystem from "./filesystem";
import frames from "./frames";

// Mounted at /api/v1/w/:wId/sandbox. This sub-tree is mounted before
// `publicWorkspaceApp` in `routes/v1/index.ts` so it does not inherit
// `publicApiAuth`. Every route below mounts `sandboxAuth` with an explicit
// token kind.
const app = sandboxApp();

app.route("/actions", actions);
app.route("/filesystem", filesystem);
app.route("/frames", frames);

export default app;
