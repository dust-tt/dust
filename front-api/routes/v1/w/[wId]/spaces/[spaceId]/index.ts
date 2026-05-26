import { publicApiApp } from "@front-api/middlewares/ctx";

import conversationIds from "./conversation_ids";
import dataSources from "./data_sources";
import members from "./members";
import projectFiles from "./project_files";
import projectMetadata from "./project_metadata";

// Mounted at /api/v1/w/:wId/spaces/:spaceId. publicApiAuth is applied by the
// parent v1 workspace sub-app, so ctx.get("auth") is always available here.
const app = publicApiApp();

app.route("/conversation_ids", conversationIds);
app.route("/data_sources", dataSources);
app.route("/members", members);
app.route("/project_files", projectFiles);
app.route("/project_metadata", projectMetadata);

export default app;
