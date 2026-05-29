import { workspaceApp } from "@front-api/middlewares/ctx";
import { workspaceAuth } from "@front-api/middlewares/workspace_auth";

import conversationEvents from "./assistant/conversations/[cId]/events";
import messageEvents from "./assistant/conversations/[cId]/messages/[mId]/events";
import mcpRequests from "./mcp/requests";

// Mounted at /api/sse/w/:wId. SSE routes inherit the same workspace auth as
// their non-SSE counterparts under /api/w/:wId. The leaves are mounted at their
// full sub-paths — intermediate path segments carry no logic, so no per-node
// app is created.
const app = workspaceApp();

app.use("*", workspaceAuth());

app.route("/assistant/conversations/:cId/events", conversationEvents);
app.route("/assistant/conversations/:cId/messages/:mId/events", messageEvents);
app.route("/mcp/requests", mcpRequests);

export default app;
