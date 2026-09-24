import { workspaceApp } from "@front-api/middlewares/ctx";

import featured from "./featured";

// Mounted at /api/w/:wId/discovery.
const app = workspaceApp();

app.route("/featured", featured);

export default app;
