import { redirectToSse } from "@front-api/lib/api/sse/redirect";
import { workspaceApp } from "@front-api/middlewares/ctx";

// Mounted at /api/w/:wId/assistant/conversations/:cId/events.
//
// This endpoint is SSE: the actual handler lives in Hono at
// `front-api/routes/sse/w/[wId]/assistant/conversations/[cId]/events.ts`,
// served under the `/api/sse/` prefix that the ingress routes to dedicated
// front-sse pods. Hono only registers a 307 redirect here so the routing
// contract matches the Next middleware redirect at the same path.
const app = workspaceApp();

/**
 * @swagger
 * /api/w/{wId}/assistant/conversations/{cId}/events:
 *   get:
 *     summary: Stream conversation events
 *     description: |
 *       Stream conversation events using Server-Sent Events (SSE). The request redirects to /api/sse/ for SSE traffic routing.
 *       The stream starts with a named `dust-handshake` frame containing `data: {}`. Unnamed event frames carry JSON with `eventId` and `data` fields. A plain-text `data: done` frame ends the current connection; clients may reconnect with `lastEventId`.
 *     tags:
 *       - Private Events
 *     parameters:
 *       - in: path
 *         name: wId
 *         required: true
 *         description: ID of the workspace
 *         schema:
 *           type: string
 *       - in: path
 *         name: cId
 *         required: true
 *         description: ID of the conversation
 *         schema:
 *           type: string
 *       - in: query
 *         name: lastEventId
 *         required: false
 *         description: Redis stream ID of the last received conversation event. Omit or pass an empty value to start from the available history.
 *         schema:
 *           type: string
 *     security:
 *       - BearerAuth: []
 *     responses:
 *       200:
 *         description: |
 *           SSE event stream with a named handshake followed by unnamed conversation frames. Each conversation frame is sent as `data: {json}\n\n`. The `data` field inside the JSON wrapper is discriminated by `type`.
 *         content:
 *           text/event-stream:
 *             schema:
 *               $ref: '#/components/schemas/PrivateConversationStreamEnvelope'
 *       401:
 *         description: Unauthorized
 */

app.get("/", redirectToSse);

export default app;
