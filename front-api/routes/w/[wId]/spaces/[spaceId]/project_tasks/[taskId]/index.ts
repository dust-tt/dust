import { Hono } from "hono";

import start from "./start";

// Mounted under /api/w/:wId/spaces/:spaceId/project_tasks/:taskId.
const app = new Hono();

app.route("/start", start);

export default app;
