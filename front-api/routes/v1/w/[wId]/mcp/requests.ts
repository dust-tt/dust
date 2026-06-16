import { PostMCPRequestsRequestQuerySchema } from "@dust-tt/client";
import { publicApiApp } from "@front-api/middlewares/ctx";
import { streamingTag } from "@front-api/middlewares/streaming";
import { validate } from "@front-api/middlewares/validator";
import { streamMcpRequests } from "@front-api/routes/sse/v1/w/[wId]/mcp/requests";

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
app.get("/", validate("query", PostMCPRequestsRequestQuerySchema), (ctx) =>
  streamMcpRequests(ctx, ctx.var.auth, ctx.req.valid("query"))
);

export default app;
