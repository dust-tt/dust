import { Hono } from "hono";

import apps from "./apps";
import dataSourceViews from "./data_source_views";
import dataSources from "./data_sources";
import join from "./join";
import leave from "./leave";
import mcp from "./mcp";
import mcpViews from "./mcp_views";
import projectContext from "./project_context";
import projectTasks from "./project_tasks";
import searchConversations from "./search_conversations";
import star from "./star";
import webhookSourceViews from "./webhook_source_views";

// Mounted under /api/w/:wId/spaces/:spaceId. Per-space sub-resource sub-apps
// live in their own sibling files. Each sub-app applies its own
// `spaceResource(...)` middleware so different permission options can be used
// per route.
const app = new Hono();

app.route("/apps", apps);
app.route("/data_source_views", dataSourceViews);
app.route("/data_sources", dataSources);
app.route("/join", join);
app.route("/leave", leave);
app.route("/mcp", mcp);
app.route("/mcp_views", mcpViews);
app.route("/project_context", projectContext);
app.route("/project_tasks", projectTasks);
app.route("/search_conversations", searchConversations);
app.route("/star", star);
app.route("/webhook_source_views", webhookSourceViews);

export default app;
