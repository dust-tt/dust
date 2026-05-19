import { Hono } from "hono";

import wIdRoutes from "./[wId]";

// Mounted at /api/poke/workspaces.
const app = new Hono();

app.route("/:wId", wIdRoutes);

export default app;
