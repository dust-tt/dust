import { workspaceApp } from "@front-api/middlewares/ctx";
import { streamingTag } from "@front-api/middlewares/streaming";
import { validate } from "@front-api/middlewares/validator";
import {
  PostMCPRequestsRequestQuerySchema,
  streamMcpRequests,
} from "@front-api/routes/sse/v1/w/[wId]/mcp/requests";
import { z } from "zod";

// Mounted at /api/sse/w/:wId/mcp/requests. Handler logic lives in the
// v1 sibling file.
const BrowserMCPRequestsQuerySchema = PostMCPRequestsRequestQuerySchema.extend({
  transport: z.enum(["sse", "poll"]).default("sse"),
});

const app = workspaceApp();

app.use("*", streamingTag);
/**
 * @ignoreswagger Internal browser endpoint: SSE by default; transport=poll returns JSON event batches.
 */
app.get("/", validate("query", BrowserMCPRequestsQuerySchema), (ctx) => {
  const query = ctx.req.valid("query");
  return streamMcpRequests(ctx, ctx.var.auth, query, query.transport);
});

export default app;
