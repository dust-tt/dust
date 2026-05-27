import { validateMCPServerAccess } from "@app/lib/api/actions/mcp/client_side_registry";
import { getMCPEventsForServer } from "@app/lib/api/assistant/mcp_events";
import { PostMCPRequestsRequestQuerySchema } from "@dust-tt/client";
import { publicApiApp } from "@front-api/middlewares/ctx";
import { streamingTag } from "@front-api/middlewares/streaming";
import { apiError } from "@front-api/middlewares/utils";
import { validate } from "@front-api/middlewares/validator";
import { stream } from "hono/streaming";

// Mounted at /api/v1/w/:wId/mcp/requests.
const app = publicApiApp();

app.use("*", streamingTag);

/**
 * @swagger
 * /api/v1/w/{wId}/mcp/requests:
 *   get:
 *     summary: Stream MCP tool requests for a workspace
 *     description: |
 *       [Documentation](https://docs.dust.tt/docs/client-side-mcp-server)
 *       Server-Sent Events (SSE) endpoint that streams MCP tool requests for a workspace.
 *       This endpoint is used by client-side MCP servers to listen for tool requests in real-time.
 *       The connection will remain open and events will be sent as new tool requests are made.
 *     tags:
 *       - MCP
 *     security:
 *       - BearerAuth: []
 *     parameters:
 *       - in: path
 *         name: wId
 *         required: true
 *         description: ID of the workspace
 *         schema:
 *           type: string
 *       - in: query
 *         name: serverId
 *         required: true
 *         description: ID of the MCP server to filter events for
 *         schema:
 *           type: string
 *       - in: query
 *         name: lastEventId
 *         required: false
 *         description: ID of the last event to filter events for
 *         schema:
 *           type: string
 *     responses:
 *       200:
 *         description: |
 *           Connection established successfully. Events will be streamed in Server-Sent Events format.
 *           Each event will contain a tool request that needs to be processed by the MCP server.
 *         content:
 *           text/event-stream:
 *             schema:
 *               type: object
 *               properties:
 *                 type:
 *                   type: string
 *                   description: Type of the event (e.g. "tool_request")
 *                 data:
 *                   type: object
 *                   description: The tool request data
 *       400:
 *         description: Bad Request. Missing or invalid parameters.
 *       401:
 *         description: Unauthorized. Invalid or missing authentication token.
 *       403:
 *         description: Forbidden. You don't have access to this workspace or MCP server.
 *       500:
 *         description: Internal Server Error.
 */
app.get(
  "/",
  validate("query", PostMCPRequestsRequestQuerySchema),
  async (ctx) => {
    const auth = ctx.get("auth");
    const { serverId, lastEventId } = ctx.req.valid("query");

    const isValidAccess = await validateMCPServerAccess(auth, {
      serverId,
    });
    if (!isValidAccess) {
      return apiError(ctx, {
        status_code: 403,
        api_error: {
          type: "mcp_auth_error",
          message:
            "You don't have access to this MCP server or it has expired.",
        },
      });
    }

    ctx.header("Content-Type", "text/event-stream");
    ctx.header("Cache-Control", "no-cache");
    ctx.header("Connection", "keep-alive");
    ctx.header("X-Accel-Buffering", "no");
    ctx.header("Content-Encoding", "none");

    return stream(ctx, async (s) => {
      const controller = new AbortController();
      const { signal } = controller;

      // Handle client disconnection.
      s.onAbort(() => {
        controller.abort();
      });

      const mcpEvents = getMCPEventsForServer(
        auth,
        {
          lastEventId,
          mcpServerId: serverId,
        },
        signal
      );

      for await (const event of mcpEvents) {
        await s.write(`data: ${JSON.stringify(event)}\n\n`);

        if (s.aborted || signal.aborted) {
          break;
        }
      }

      await s.write("data: done\n\n");
    });
  }
);

export default app;
