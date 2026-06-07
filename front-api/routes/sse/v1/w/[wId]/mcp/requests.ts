// Editing this file edits both the v1 (public API) and private SSE
// MCP-requests handlers — the private mirror under
// `front-api/routes/sse/w/[wId]/mcp/requests.ts` imports `streamMcpRequests`
// from here. Public-API stability rules ([BACK12]) apply.

import { validateMCPServerAccess } from "@app/lib/api/actions/mcp/client_side_registry";
import { getMCPEventsForServer } from "@app/lib/api/assistant/mcp_events";
import type { Authenticator } from "@app/lib/auth";
import type { PostMCPRequestsRequestQueryType } from "@dust-tt/client";
import { PostMCPRequestsRequestQuerySchema } from "@dust-tt/client";
import { streamEvents } from "@front-api/lib/api/sse/stream_events";
import { publicApiApp } from "@front-api/middlewares/ctx";
import { streamingTag } from "@front-api/middlewares/streaming";
import { apiError } from "@front-api/middlewares/utils";
import { validate } from "@front-api/middlewares/validator";
import type { Context } from "hono";

// Re-exported so the private mirror can reuse the query schema without importing
// `@dust-tt/client` itself (that dependency stays confined to public-API files).
export { PostMCPRequestsRequestQuerySchema };

export async function streamMcpRequests(
  ctx: Context,
  auth: Authenticator,
  query: PostMCPRequestsRequestQueryType
) {
  const isValidAccess = await validateMCPServerAccess(auth, {
    serverId: query.serverId,
  });
  if (!isValidAccess) {
    return apiError(ctx, {
      status_code: 403,
      api_error: {
        type: "mcp_auth_error",
        message: "You don't have access to this MCP server or it has expired.",
      },
    });
  }

  return streamEvents({
    ctx,
    iterator: (signal) =>
      getMCPEventsForServer(
        auth,
        { lastEventId: query.lastEventId, mcpServerId: query.serverId },
        signal
      ),
    writeDoneSentinel: true,
  });
}

// Mounted at /api/sse/v1/w/:wId/mcp/requests.
const app = publicApiApp();

app.use("*", streamingTag);
/** @ignoreswagger */
app.get("/", validate("query", PostMCPRequestsRequestQuerySchema), (ctx) =>
  streamMcpRequests(ctx, ctx.var.auth, ctx.req.valid("query"))
);

export default app;
