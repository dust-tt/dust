import { workspaceApp } from "@front-api/middlewares/ctx";

import destroy from "./destroy";

// Mounted at /api/w/:wId/dust_app_secrets/:name.
const app = workspaceApp();

app.route("/destroy", destroy);

export default app;
