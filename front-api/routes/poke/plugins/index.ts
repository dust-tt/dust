import { Hono } from "hono";

import pluginId from "./[pluginId]";

const app = new Hono();

app.route("/:pluginId", pluginId);

export default app;
