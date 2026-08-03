import { createHono } from "@front-api/lib/hono";

import chat from "./chat";
import progress from "./progress";

// Mounted under /api/marketing/academy.
const app = createHono();

app.route("/chat", chat);
app.route("/progress", progress);

export default app;
