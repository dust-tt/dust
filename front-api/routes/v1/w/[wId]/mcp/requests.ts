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
 *       Events arrive as new tool requests are made. Reconnect with `lastEventId` after the stream closes to continue receiving events.
 *       The stream starts with a named `dust-handshake` frame containing `data: {}`. Unnamed request frames carry JSON with `eventId` and `data` fields. A plain-text `data: done` frame ends the current connection; clients may reconnect with `lastEventId`.
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
 *         description: Redis stream ID of the last received request event. Omit to start from the available history.
 *         schema:
 *           type: string
 *     responses:
 *       200:
 *         description: |
 *           SSE event stream with a named handshake followed by unnamed request frames. The JSON `data` field in each request frame contains the tool request.
 *         content:
 *           text/event-stream:
 *             schema:
 *               type: object
 *               required: [eventId, data]
 *               properties:
 *                 eventId:
 *                   type: string
 *                   description: Redis stream ID used as the resume cursor.
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
