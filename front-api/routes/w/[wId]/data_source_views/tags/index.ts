import { Hono } from "hono";

import search from "./search";

// Mounted under /api/w/:wId/data_source_views/tags.
const app = new Hono();

app.route("/search", search);

export default app;
