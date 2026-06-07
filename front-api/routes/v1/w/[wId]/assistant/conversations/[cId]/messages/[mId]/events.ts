import { redirectToSse } from "@front-api/lib/api/sse/redirect";
import { publicApiApp } from "@front-api/middlewares/ctx";

// Mounted at /api/v1/w/:wId/assistant/conversations/:cId/messages/:mId/events.
//
// This endpoint is SSE: the actual handler lives in Hono at
// `front-api/routes/sse/v1/w/[wId]/assistant/conversations/[cId]/messages/[mId]/events.ts`,
// served under the `/api/sse/` prefix that the ingress routes to dedicated
// front-sse pods. Hono only registers a 307 redirect here so the routing
// contract matches the Next middleware redirect at the same path.
const app = publicApiApp();

/**
 * @swagger
 * /api/v1/w/{wId}/assistant/conversations/{cId}/messages/{mId}/events:
 *   get:
 *     summary: Get events for a message
 *     description: Get events for a message in the workspace identified by {wId}.
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
 *       - in: path
 *         name: mId
 *         required: true
 *         description: ID of the message
 *         schema:
 *           type: string
 *       - in: query
 *         name: lastEventId
 *         description: ID of the last event received
 *         schema:
 *           type: string
 *     security:
 *       - BearerAuth: []
 *     responses:
 *       200:
 *         description: The events
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 events:
 *                   type: array
 *                   items:
 *                     type: object
 *                     properties:
 *                       id:
 *                         type: string
 *                         description: ID of the event
 *                       type:
 *                         type: string
 *                         description: Type of the event
 *                       data:
 *                         $ref: '#/components/schemas/Message'
 *       400:
 *         description: Bad Request
 *       401:
 *         description: Unauthorized
 *       404:
 *         description: Not Found
 *       500:
 *         description: Internal Server Error
 */

app.get("/", redirectToSse);

export default app;
