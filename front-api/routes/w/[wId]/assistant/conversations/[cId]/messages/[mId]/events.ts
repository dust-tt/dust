import { redirectToSse } from "@front-api/lib/api/sse/redirect";
import { workspaceApp } from "@front-api/middlewares/ctx";

// Mounted at /api/w/:wId/assistant/conversations/:cId/messages/:mId/events.
//
// This endpoint is SSE: the actual handler lives in Hono at
// `front-api/routes/sse/w/[wId]/assistant/conversations/[cId]/messages/[mId]/events.ts`,
// served under the `/api/sse/` prefix that the ingress routes to dedicated
// front-sse pods. Hono only registers a 307 redirect here so the routing
// contract matches the Next middleware redirect at the same path.
const app = workspaceApp();

/**
 * @swagger
 * /api/w/{wId}/assistant/conversations/{cId}/messages/{mId}/events:
 *   get:
 *     summary: Stream message events
 *     description: Stream real-time events for a specific agent message using Server-Sent Events (SSE). Only available for agent messages. This endpoint is redirected to /api/sse/ for SSE traffic routing.
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
 *       - in: path
 *         name: mId
 *         required: true
 *         description: ID of the message
 *         schema:
 *           type: string
 *     security:
 *       - BearerAuth: []
 *     responses:
 *       200:
 *         description: |
 *           SSE event stream. Each event is sent as `data: {json}\n\n`.
 *           Events are discriminated by the `type` field. Each event payload also includes a `step` integer.
 *         content:
 *           text/event-stream:
 *             schema:
 *               $ref: '#/components/schemas/PrivateAgentMessageEvent'
 *       401:
 *         description: Unauthorized
 */

app.get("/", redirectToSse);

export default app;
