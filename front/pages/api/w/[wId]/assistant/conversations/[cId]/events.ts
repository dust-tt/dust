/**
 * @swagger
 * /api/w/{wId}/assistant/conversations/{cId}/events:
 *   get:
 *     summary: Stream conversation events
 *     description: Stream real-time conversation events using Server-Sent Events (SSE). This endpoint is redirected to /api/sse/ for SSE traffic routing.
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
 *     security:
 *       - BearerAuth: []
 *     responses:
 *       200:
 *         description: |
 *           SSE event stream. Each event is sent as `data: {json}\n\n`.
 *           Events are discriminated by the `type` field.
 *         content:
 *           text/event-stream:
 *             schema:
 *               $ref: '#/components/schemas/PrivateConversationEvent'
 *       401:
 *         description: Unauthorized
 */
// This endpoint is redirected (307) to /api/sse/w/[wId]/assistant/conversations/[cId]/events
// via middleware. The /api/sse/ prefix allows the ingress to route SSE traffic to front-sse pods.

import { isConversationEventAllowedForAuth } from "@app/lib/api/assistant/conversation";
import { getConversationEvents } from "@app/lib/api/assistant/pubsub";
import { withSessionAuthenticationForWorkspace } from "@app/lib/api/auth_wrappers";
import { withResourceFetchingFromRoute } from "@app/lib/api/resource_wrappers";
import { initSSEResponse } from "@app/lib/api/sse";
import type { Authenticator } from "@app/lib/auth";
import type { ConversationResource } from "@app/lib/resources/conversation_resource";
import { getStatsDClient } from "@app/lib/utils/statsd";
import logger from "@app/logger/logger";
import { apiError } from "@app/logger/withlogging";
import type { WithAPIErrorResponse } from "@app/types/error";
import type { NextApiRequest, NextApiResponse } from "next";

async function handler(
  req: NextApiRequest,
  res: NextApiResponse<WithAPIErrorResponse<void>>,
  auth: Authenticator,
  { conversation }: { conversation: ConversationResource }
): Promise<void> {
  // eslint-disable-next-line @typescript-eslint/prefer-nullish-coalescing
  const lastEventId = req.query.lastEventId || null;
  if (lastEventId && typeof lastEventId !== "string") {
    return apiError(req, res, {
      status_code: 400,
      api_error: {
        type: "invalid_request_error",
        message:
          "Invalid query parameters, `lastEventId` should be string if specified.",
      },
    });
  }

  switch (req.method) {
    case "GET":
      initSSEResponse(res);

      // Create an AbortController to handle client disconnection
      const controller = new AbortController();
      const { signal } = controller;

      // Handle client disconnection
      req.on("close", () => {
        controller.abort();
      });

      const eventStream = getConversationEvents({
        conversationId: conversation.sId,
        lastEventId,
        signal,
      });

      let backpressureCount = 0;

      for await (const event of eventStream) {
        // Some events are targetted toward a specific user.
        const isAllowed = await isConversationEventAllowedForAuth(auth, {
          event: event.data,
        });
        if (!isAllowed) {
          continue;
        }

        const writeSuccessful = res.write(`data: ${JSON.stringify(event)}\n\n`);
        if (!writeSuccessful) {
          backpressureCount++;
          getStatsDClient().increment("streaming.backpressure.count", 1, [
            "endpoint_type:internal",
            "endpoint:conversation_events",
          ]);
        }
        // @ts-expect-error - We need it for streaming but it does not exists in the types.
        res.flush();

        // If the client disconnected, stop the event stream
        if (signal.aborted) {
          break;
        }
      }
      const doneWriteSuccessful = res.write("data: done\n\n");
      if (!doneWriteSuccessful) {
        backpressureCount++;
        getStatsDClient().increment("streaming.backpressure.count", 1, [
          "endpoint_type:internal",
          "endpoint:conversation_events",
        ]);
      }
      // @ts-expect-error - We need it for streaming but it does not exists in the types.
      res.flush();

      if (backpressureCount > 10) {
        logger.warn(
          {
            conversationId: conversation.sId,
            backpressureCount,
            endpointType: "internal",
          },
          "High streaming backpressure detected during conversation events"
        );
      }

      res.status(200).end();
      return;
    default:
      return apiError(req, res, {
        status_code: 405,
        api_error: {
          type: "method_not_supported_error",
          message: "The method passed is not supported, GET is expected.",
        },
      });
  }
}

export default withSessionAuthenticationForWorkspace(
  withResourceFetchingFromRoute(handler, { conversation: {} }),
  { isStreaming: true }
);
