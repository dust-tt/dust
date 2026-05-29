import { workspaceApp } from "@front-api/middlewares/ctx";
import { streamingTag } from "@front-api/middlewares/streaming";
import { validate } from "@front-api/middlewares/validator";
import {
  PostMCPRequestsRequestQuerySchema,
  streamMcpRequests,
} from "@front-api/routes/sse/v1/w/[wId]/mcp/requests";

// Mounted at /api/sse/w/:wId/mcp/requests. Handler logic lives in the
// v1 sibling file.
const app = workspaceApp();

app.use("*", streamingTag);
app.get("/", validate("query", PostMCPRequestsRequestQuerySchema), (ctx) =>
  streamMcpRequests(ctx, ctx.var.auth, ctx.req.valid("query"))
);

export default app;
