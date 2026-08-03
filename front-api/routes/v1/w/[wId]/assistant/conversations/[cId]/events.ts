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
 *     description: Get the events for a conversation in the workspace identified by {wId}.
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
 *         description: ID of the last event
 *         schema:
 *           type: string
 *     security:
 *       - BearerAuth: []
 *     responses:
 *       200:
 *         description: Events for the conversation, view the "Events" page from this documentation for more information.
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
