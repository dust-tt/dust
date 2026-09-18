import { redirectToSse } from "@front-api/lib/api/sse/redirect";
import { workspaceApp } from "@front-api/middlewares/ctx";

import poll from "./poll";

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
app.route("/poll", poll);

export default app;
