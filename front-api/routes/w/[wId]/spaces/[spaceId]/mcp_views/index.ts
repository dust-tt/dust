import { Hono } from "hono";

import notActivated from "./not_activated";
import svId from "./[svId]";

// Mounted under /api/w/:wId/spaces/:spaceId/mcp_views.
const app = new Hono();

// Register `/not_activated` BEFORE `/:svId` so the param route does not
// swallow "not_activated" as an id.
app.route("/not_activated", notActivated);
app.route("/:svId", svId);

export default app;
