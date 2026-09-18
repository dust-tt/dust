import type { GetAgentMessageEventsResponseBody } from "@app/types/api/assistant/messages";
import {
  MessageParamSchema,
  pollMessageEventsForRoute,
} from "@front-api/lib/api/sse/message_events";
import { SseQuerySchema } from "@front-api/lib/api/sse/stream_events";
import { workspaceApp } from "@front-api/middlewares/ctx";
import type { HandlerResult } from "@front-api/middlewares/utils";
import { validate } from "@front-api/middlewares/validator";

const app = workspaceApp();

/**
 * @swagger
 * /api/w/{wId}/assistant/conversations/{cId}/messages/{mId}/events/poll:
 *   get:
 *     summary: Poll message events
 *     description: Wait for agent-message events after the supplied Redis stream event ID. The request returns when events are available or after 25 seconds.
 *     tags:
 *       - Private Events
 *     parameters:
 *       - in: path
 *         name: wId
 *         required: true
 *         schema:
 *           type: string
 *       - in: path
 *         name: cId
 *         required: true
 *         schema:
 *           type: string
 *       - in: path
 *         name: mId
 *         required: true
 *         schema:
 *           type: string
 *       - in: query
 *         name: lastEventId
 *         required: false
 *         schema:
 *           type: string
 *     security:
 *       - BearerAuth: []
 *     responses:
 *       200:
 *         description: Message events retrieved successfully
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               required: [events]
 *               properties:
 *                 events:
 *                   type: array
 *                   items:
 *                     type: string
 *                     description: Serialized message event in the same format as the SSE data payload.
 *       400:
 *         description: The requested message is not an agent message
 *       401:
 *         description: Unauthorized
 *       404:
 *         description: Conversation or message not found
 */
app.get(
  "/",
  validate("param", MessageParamSchema),
  validate("query", SseQuerySchema),
  async (ctx): HandlerResult<GetAgentMessageEventsResponseBody> => {
    const { cId, mId } = ctx.req.valid("param");
    const { lastEventId } = ctx.req.valid("query");

    return pollMessageEventsForRoute(ctx, ctx.var.auth, {
      conversationId: cId,
      messageId: mId,
      lastEventId,
    });
  }
);

export default app;
