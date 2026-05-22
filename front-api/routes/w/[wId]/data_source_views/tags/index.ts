import { workspaceApp } from "@front-api/middleware/env";

import search from "./search";

// Mounted under /api/w/:wId/data_source_views/tags.
const app = workspaceApp();

app.route("/search", search);

export default app;
