import { workspaceApp } from "@front-api/middlewares/ctx";

import pdf from "./pdf";

// Mounted at /api/w/:wId/files/:fileId/export.
const app = workspaceApp();

app.route("/pdf", pdf);

export default app;
