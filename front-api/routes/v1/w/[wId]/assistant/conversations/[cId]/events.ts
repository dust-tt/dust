import { redirectToSse } from "@front-api/lib/api/sse/redirect";
import { publicApiApp } from "@front-api/middlewares/ctx";

// Mounted at /api/v1/w/:wId/assistant/conversations/:cId/events.
//
// This endpoint is SSE: the actual handler lives in Hono at
// `front-api/routes/sse/v1/w/[wId]/assistant/conversations/[cId]/events.ts`,
// served under the `/api/sse/` prefix that the ingress routes to dedicated
// front-sse pods. Hono only registers a 307 redirect here so the routing
// contract matches the Next middleware redirect at the same path.
const app = publicApiApp();

/**
 * @swagger
 * /api/v1/w/{wId}/assistant/conversations/{cId}/events:
 *   get:
 *     summary: Get the events for a conversation
 *     description: |
 *       Stream conversation events for the workspace identified by {wId} using Server-Sent Events (SSE).
 *       The stream starts with a named `dust-handshake` frame containing `data: {}`. Unnamed event frames carry JSON with `eventId` and `data` fields. A plain-text `data: done` frame ends the current connection; clients may reconnect with `lastEventId`.
 *     tags:
 *       - Conversations
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
 *         description: SSE event stream with a named handshake followed by unnamed conversation frames. Each conversation frame contains JSON with `eventId` and `data` fields. The `data` field is the conversation event. View the "Events" page from this documentation for more information.
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
 *                   description: Conversation event discriminated by its type field.
 *       400:
 *         description: Bad Request. Missing or invalid parameters.
 *       401:
 *         description: Unauthorized. Invalid or missing authentication token.
 *       404:
 *         description: Conversation not found.
 *       500:
 *         description: Internal Server Error.
 */

app.get("/", redirectToSse);

export default app;
