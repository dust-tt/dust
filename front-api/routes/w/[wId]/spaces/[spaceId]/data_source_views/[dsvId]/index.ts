import { Hono } from "hono";

import contentNodes from "./content-nodes";
import documents from "./documents";
import tables from "./tables";

// Mounted under /api/w/:wId/spaces/:spaceId/data_source_views/:dsvId.
const app = new Hono();

app.route("/content-nodes", contentNodes);
app.route("/documents", documents);
app.route("/tables", tables);

export default app;
