import { Hono } from "hono";

import markRead from "./mark_read";
import taskId from "./[taskId]";

// Mounted under /api/w/:wId/spaces/:spaceId/project_tasks.
const app = new Hono();

// Register `/mark_read` BEFORE `/:taskId` so the param route does not
// swallow "mark_read" as an id.
app.route("/mark_read", markRead);
app.route("/:taskId", taskId);

export default app;
