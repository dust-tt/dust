import { workspaceApp } from "@front-api/middlewares/ctx";

import transcribe from "./transcribe";

// Mounted at /api/w/:wId/services.
const app = workspaceApp();

app.route("/transcribe", transcribe);

export default app;
