import { Hono } from "hono";

import pdf from "./pdf";

// Mounted at /api/w/:wId/files/:fileId/export.
const app = new Hono();

app.route("/pdf", pdf);

export default app;
