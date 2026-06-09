import { publicApiApp } from "@front-api/middlewares/ctx";

import apps from "./apps";
import conversationIds from "./conversation_ids";
import conversations from "./conversations";
import dataSourceViews from "./data_source_views";
import dataSources from "./data_sources";
import mcpServerViews from "./mcp_server_views";
import members from "./members";
import projectFiles from "./project_files";
import projectMetadata from "./project_metadata";

// Mounted at /api/v1/w/:wId/spaces/:spaceId. publicApiAuth is applied by the
// parent v1 workspace sub-app, so ctx.get("auth") is always available here.
const app = publicApiApp();

app.route("/apps", apps);
app.route("/conversation_ids", conversationIds);
app.route("/conversations", conversations);
app.route("/data_source_views", dataSourceViews);
app.route("/data_sources", dataSources);
app.route("/mcp_server_views", mcpServerViews);
app.route("/members", members);
app.route("/project_files", projectFiles);
app.route("/project_metadata", projectMetadata);

export default app;
