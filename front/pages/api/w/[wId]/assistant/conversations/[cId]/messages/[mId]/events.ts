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
// This endpoint is redirected (307) to /api/sse/w/[wId]/assistant/conversations/[cId]/messages/[mId]/events
// via middleware. The /api/sse/ prefix allows the ingress to route SSE traffic to front-sse pods.

import { getConversationMessageType } from "@app/lib/api/assistant/conversation";
import { apiErrorForConversation } from "@app/lib/api/assistant/conversation/helper";
import { getMessagesEvents } from "@app/lib/api/assistant/pubsub";
import { withSessionAuthenticationForWorkspace } from "@app/lib/api/auth_wrappers";
import { initSSEResponse } from "@app/lib/api/sse";
import type { Authenticator } from "@app/lib/auth";
import { ConversationResource } from "@app/lib/resources/conversation_resource";
import { getStatsDClient } from "@app/lib/utils/statsd";
import logger from "@app/logger/logger";
import { apiError } from "@app/logger/withlogging";
import type { WithAPIErrorResponse } from "@app/types/error";
import type { NextApiRequest, NextApiResponse } from "next";

async function handler(
  req: NextApiRequest,
  res: NextApiResponse<WithAPIErrorResponse<void>>,
  auth: Authenticator
): Promise<void> {
  if (!(typeof req.query.cId === "string")) {
    return apiError(req, res, {
      status_code: 400,
      api_error: {
        type: "invalid_request_error",
        message: "Invalid query parameters, `cId` (string) is required.",
      },
    });
  }
  const conversationId = req.query.cId;
  const conversationRes =
    await ConversationResource.fetchConversationWithoutContent(
      auth,
      conversationId
    );

  if (conversationRes.isErr()) {
    return apiErrorForConversation(req, res, conversationRes.error);
  }

  const conversation = conversationRes.value;

  if (!(typeof req.query.mId === "string")) {
    return apiError(req, res, {
      status_code: 400,
      api_error: {
        type: "invalid_request_error",
        message: "Invalid query parameters, `cId` (string) is required.",
      },
    });
  }

  const messageId = req.query.mId;
  const messageType = await getConversationMessageType(
    auth,
    conversation,
    messageId
  );

  if (!messageType) {
    return apiError(req, res, {
      status_code: 404,
      api_error: {
        type: "message_not_found",
        message: "The message you're trying to access was not found.",
      },
    });
  }
  if (messageType !== "agent_message") {
    return apiError(req, res, {
      status_code: 400,
      api_error: {
        type: "invalid_request_error",
        message: "Events are only available for agent messages.",
      },
    });
  }

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

      const eventStream = getMessagesEvents(auth, {
        messageId,
        lastEventId,
        signal,
      });

      let backpressureCount = 0;

      for await (const event of eventStream) {
        const writeSuccessful = res.write(`data: ${JSON.stringify(event)}\n\n`);
        if (!writeSuccessful) {
          backpressureCount++;
          getStatsDClient().increment("streaming.backpressure.count", 1, [
            "endpoint_type:internal",
            "endpoint:message_events",
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
          "endpoint:message_events",
        ]);
      }
      // @ts-expect-error - We need it for streaming but it does not exists in the types.
      res.flush();

      if (backpressureCount > 10) {
        logger.warn(
          {
            conversationId: conversation.sId,
            messageId,
            backpressureCount,
            endpointType: "internal",
          },
          "High streaming backpressure detected during message events"
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

export default withSessionAuthenticationForWorkspace(handler, {
  isStreaming: true,
});
