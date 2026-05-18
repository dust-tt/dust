import { Hono } from "hono";

import contentNodes from "./content_nodes";
import files from "./files";

// Mounted under /api/w/:wId/spaces/:spaceId/project_context.
const app = new Hono();

app.route("/content_nodes", contentNodes);
app.route("/files", files);

export default app;
