import { workspaceApp } from "@front-api/middlewares/ctx";

import generateSchema from "./generate_schema";

// Mounted under /api/w/:wId/assistant/builder/process.
const app = workspaceApp();

app.route("/generate_schema", generateSchema);

export default app;
