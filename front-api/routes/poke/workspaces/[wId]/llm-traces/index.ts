import { Hono } from "hono";

import runId from "./[runId]";

const app = new Hono();

app.route("/:runId", runId);

export default app;
