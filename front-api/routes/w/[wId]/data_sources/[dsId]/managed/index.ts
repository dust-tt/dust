import { workspaceApp } from "@front-api/middleware/env";

import configByKey from "./config/[key]";
import notion from "./notion";
import notionUrlStatus from "./notion_url_status";
import notionUrlSync from "./notion_url_sync";
import oauthMetadata from "./oauth-metadata";
import permissions from "./permissions";
import update from "./update";

// Mounted under /api/w/:wId/data_sources/:dsId/managed.
const app = workspaceApp();

app.route("/config/:key", configByKey);
app.route("/notion", notion);
app.route("/notion_url_status", notionUrlStatus);
app.route("/notion_url_sync", notionUrlSync);
app.route("/oauth-metadata", oauthMetadata);
app.route("/permissions", permissions);
app.route("/update", update);

export default app;
