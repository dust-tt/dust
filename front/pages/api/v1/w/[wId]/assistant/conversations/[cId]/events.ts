import type { ConversationEventType } from "@dust-tt/client";
import type { NextApiRequest, NextApiResponse } from "next";

import { apiErrorForConversation } from "@app/lib/api/assistant/conversation/helper";
import { getConversationEvents } from "@app/lib/api/assistant/pubsub";
import { withPublicAPIAuthentication } from "@app/lib/api/auth_wrappers";
import { addBackwardCompatibleAgentMessageFields } from "@app/lib/api/v1/backward_compatibility";
import type { Authenticator } from "@app/lib/auth";
import { ConversationResource } from "@app/lib/resources/conversation_resource";
import logger from "@app/logger/logger";
import { statsDClient } from "@app/logger/statsDClient";
import { apiError } from "@app/logger/withlogging";
import type { WithAPIErrorResponse } from "@app/types";

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
 *       405:
 *         description: Method not supported. Only GET is expected.
 *       500:
 *         description: Internal Server Error.
 */

async function handler(
  req: NextApiRequest,
  // This endpoint only returns void as it is used only for streaming, so no need to use @dust-tt/client types.
  // eslint-disable-next-line dust/enforce-client-types-in-public-api
  res: NextApiResponse<WithAPIErrorResponse<void>>,
  auth: Authenticator
): Promise<void> {
  const { cId } = req.query;
  if (typeof cId !== "string") {
    return apiError(req, res, {
      status_code: 404,
      api_error: {
        type: "conversation_not_found",
        message: "Conversation not found.",
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

  const conversationRes =
    await ConversationResource.fetchConversationWithoutContent(auth, cId);

  if (conversationRes.isErr()) {
    return apiErrorForConversation(req, res, conversationRes.error);
  }

  const conversation = conversationRes.value;

  switch (req.method) {
    case "GET": {
      res.writeHead(200, {
        "Content-Type": "text/event-stream",
        "Cache-Control": "no-cache",
        Connection: "keep-alive",
      });
      res.flushHeaders();

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
        let publicEvent: ConversationEventType | undefined;

        if (event.data.type === "agent_message_new") {
          publicEvent = {
            eventId: event.eventId,
            data: {
              ...event.data,
              message: {
                ...event.data.message,
                ...addBackwardCompatibleAgentMessageFields(event.data.message),
              },
            },
          };
        } else {
          publicEvent = {
            eventId: event.eventId,
            data: event.data,
          };
        }

        const writeSuccessful = res.write(
          `data: ${JSON.stringify(publicEvent)}\n\n`
        );
        if (!writeSuccessful) {
          backpressureCount++;
          statsDClient.increment("streaming.backpressure.count", 1, [
            "endpoint_type:v1",
            "endpoint:conversation_events",
          ]);
        }

        // @ts-expect-error we need to flush for streaming but TS thinks flush() does not exists.
        res.flush();

        // If the client disconnected, stop the event stream
        if (signal.aborted) {
          break;
        }
      }
      const doneWriteSuccessful = res.write("data: done\n\n");
      if (!doneWriteSuccessful) {
        backpressureCount++;
        statsDClient.increment("streaming.backpressure.count", 1, [
          "endpoint_type:v1",
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
            endpointType: "v1",
          },
          "High streaming backpressure detected during conversation events"
        );
      }

      res.end();
      return;
    }

    default:
      return apiError(req, res, {
        status_code: 405,
        api_error: {
          type: "method_not_supported_error",
          message: "The method passed is not supported, POST is expected.",
        },
      });
  }
}

export default withPublicAPIAuthentication(handler, {
  isStreaming: true,
});
