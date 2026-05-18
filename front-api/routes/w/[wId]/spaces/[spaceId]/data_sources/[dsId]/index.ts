import { Hono } from "hono";

import folders from "./folders";

// Mounted under /api/w/:wId/spaces/:spaceId/data_sources/:dsId.
const app = new Hono();

app.route("/folders", folders);

export default app;
