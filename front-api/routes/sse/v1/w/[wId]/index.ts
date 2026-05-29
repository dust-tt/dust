import { publicApiApp } from "@front-api/middlewares/ctx";
import { publicApiAuth } from "@front-api/middlewares/public_api_auth";

import conversationEvents from "./assistant/conversations/[cId]/events";
import messageEvents from "./assistant/conversations/[cId]/messages/[mId]/events";
import mcpRequests from "./mcp/requests";

// Mounted at /api/sse/v1/w/:wId. SSE routes inherit the same public API auth as
// their non-SSE counterparts under /api/v1/w/:wId. The leaves are mounted at
// their full sub-paths — intermediate path segments carry no logic, so no
// per-node app is created.
const app = publicApiApp();

app.use("*", publicApiAuth);

app.route("/assistant/conversations/:cId/events", conversationEvents);
app.route(
  "/assistant/conversations/:cId/messages/:mId/events",
  messageEvents
);
app.route("/mcp/requests", mcpRequests);

export default app;
