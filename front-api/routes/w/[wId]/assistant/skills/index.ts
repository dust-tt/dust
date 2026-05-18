import { Hono } from "hono";

import skill from "./[sId]";

// Mounted under /api/w/:wId/assistant/skills.
const app = new Hono();

app.route("/:sId", skill);

export default app;
