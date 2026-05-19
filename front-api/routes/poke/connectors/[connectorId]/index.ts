import { Hono } from "hono";

import redirect from "./redirect";

// Mounted at /api/poke/connectors/:connectorId.
const app = new Hono();

app.route("/redirect", redirect);

export default app;
