import { Hono } from "hono";

import connectorId from "./[connectorId]";

// Mounted at /api/poke/connectors.
const app = new Hono();

app.route("/:connectorId", connectorId);

export default app;
