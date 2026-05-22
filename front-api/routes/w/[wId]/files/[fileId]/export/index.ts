import { workspaceApp } from "@front-api/middleware/env";

import pdf from "./pdf";

// Mounted at /api/w/:wId/files/:fileId/export.
const app = workspaceApp();

app.route("/pdf", pdf);

export default app;
