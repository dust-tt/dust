import { workspaceApp } from "@front-api/middlewares/ctx";
import { withFeatureFlag } from "@front-api/middlewares/with_feature_flag";

import mcpActionsAgentId from "./mcp_actions/[agentId]";
import requestAccess from "./request_access";
import transcripts from "./transcripts";

const app = workspaceApp();

// labs_transcripts only gates the /transcripts subtree; other labs routes
// have their own per-handler gating (or none).
app.use("/transcripts/*", withFeatureFlag("labs_transcripts"));

app.route("/mcp_actions/:agentId", mcpActionsAgentId);
app.route("/request_access", requestAccess);
app.route("/transcripts", transcripts);

export default app;
