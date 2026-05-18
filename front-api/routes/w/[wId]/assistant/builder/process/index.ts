import { Hono } from "hono";

import generateSchema from "./generate_schema";

// Mounted under /api/w/:wId/assistant/builder/process.
const app = new Hono();

app.route("/generate_schema", generateSchema);

export default app;
