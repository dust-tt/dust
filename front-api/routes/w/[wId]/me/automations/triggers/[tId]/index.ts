import { workspaceApp } from "@front-api/middlewares/ctx";

import breakdown from "./breakdown";

// Mounted under /api/w/:wId/me/automations/triggers/:tId.
const app = workspaceApp();

app.route("/breakdown", breakdown);

export default app;
