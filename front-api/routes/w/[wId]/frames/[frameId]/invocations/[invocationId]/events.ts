import { redirectToSse } from "@front-api/lib/api/sse/redirect";
import { workspaceApp } from "@front-api/middlewares/ctx";

const app = workspaceApp();

/**
 * @swagger
 * /api/w/{wId}/frames/{frameId}/invocations/{invocationId}/events:
 *   get:
 *     summary: Stream Frames v2 function invocation events
 *     description: Authorizes through the stable Frame identity and redirects to the SSE service. The invocation's own publication is used, so a republish cannot break an existing stream.
 *     tags:
 *       - Private Frames
 *     parameters:
 *       - in: path
 *         name: wId
 *         required: true
 *         schema:
 *           type: string
 *       - in: path
 *         name: frameId
 *         required: true
 *         schema:
 *           type: string
 *       - in: path
 *         name: invocationId
 *         required: true
 *         schema:
 *           type: string
 *     security:
 *       - BearerAuth: []
 *     responses:
 *       200:
 *         description: Server-Sent Event stream.
 *         content:
 *           text/event-stream:
 *             schema:
 *               $ref: '#/components/schemas/PrivateSandboxFunctionInvocationEvent'
 *       404:
 *         description: Frame use right or Frame-owned invocation not found.
 */
app.get("/", redirectToSse);

export default app;
