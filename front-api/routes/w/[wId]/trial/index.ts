import { Hono } from "hono";

import start from "./start";

// Mounted under /api/w/:wId/trial.
const app = new Hono();

app.route("/start", start);

export default app;
