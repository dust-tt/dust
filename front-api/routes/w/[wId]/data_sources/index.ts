import { Hono } from "hono";

import dsId from "./[dsId]";
import botDataSources from "./bot-data-sources";
import requestAccess from "./request_access";

// Mounted under /api/w/:wId/data_sources.
const app = new Hono();

// Register static paths BEFORE `/:dsId` so the param route does not swallow
// these names as ids.
app.route("/bot-data-sources", botDataSources);
app.route("/request_access", requestAccess);
app.route("/:dsId", dsId);

export default app;
