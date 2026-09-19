import { redirectToSse } from "@front-api/lib/api/sse/redirect";
import { workspaceApp } from "@front-api/middlewares/ctx";

import poll from "./poll";

const app = workspaceApp();

/**
 * @swagger
 * /api/w/{wId}/assistant/conversations/{cId}/messages/{mId}/events:
 *   get:
 *     summary: Stream message events
 *     description: |
 *       Stream real-time events for an agent message. The request redirects to /api/sse/ for SSE traffic routing.
 *       The stream starts with a named `dust-handshake` frame containing `data: {}`. Unnamed message frames carry JSON with `eventId` and `data` fields. A plain-text `data: done` frame ends the current connection; clients may reconnect with `lastEventId`.
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
 *       - in: query
 *         name: lastEventId
 *         required: false
 *         description: Redis stream ID of the last received message event. Omit or pass an empty value to start from the available history.
 *         schema:
 *           type: string
 *     security:
 *       - BearerAuth: []
 *     responses:
 *       200:
 *         description: |
 *           SSE event stream with a named handshake followed by unnamed message frames. Each message frame is sent as `data: {json}\n\n`. The `data` field inside the JSON wrapper is discriminated by `type` and includes a `step` integer.
 *         content:
 *           text/event-stream:
 *             schema:
 *               $ref: '#/components/schemas/PrivateAgentMessageStreamEnvelope'
 *       401:
 *         description: Unauthorized
 */

app.get("/", redirectToSse);
app.route("/poll", poll);

export default app;
