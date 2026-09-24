import { workspaceApp } from "@front-api/middlewares/ctx";

import pins from "./pins";

// Mounted at /api/w/:wId/groups/:groupId/discovery.
const app = workspaceApp();

app.route("/pins", pins);

export default app;
