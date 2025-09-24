import type { NextApiRequest, NextApiResponse } from "next";
import { z } from "zod";

import { retryAgentMessage } from "@app/lib/api/assistant/conversation";
import { getConversation } from "@app/lib/api/assistant/conversation/fetch";
import { apiErrorForConversation } from "@app/lib/api/assistant/conversation/helper";
import { retryBlockedActions } from "@app/lib/api/assistant/conversation/retry_blocked_actions";
import { withSessionAuthenticationForWorkspace } from "@app/lib/api/auth_wrappers";
import type { Authenticator } from "@app/lib/auth";
import { DustError } from "@app/lib/error";
import { apiError } from "@app/logger/withlogging";
import type { AgentMessageType, WithAPIErrorResponse } from "@app/types";
import { isAgentMessageType, isString } from "@app/types";

const PostRetryRequestQuerySchema = z.object({
  blocked_only: z.string().optional(),
});

async function handler(
  req: NextApiRequest,
  res: NextApiResponse<WithAPIErrorResponse<{ message: AgentMessageType }>>,
  auth: Authenticator
): Promise<void> {
  const { cId: conversationId, mId: messageId } = req.query;

  if (!isString(conversationId)) {
    return apiError(req, res, {
      status_code: 400,
      api_error: {
        type: "invalid_request_error",
        message: "The conversation ID is required.",
      },
    });
  }

  if (!isString(messageId)) {
    return apiError(req, res, {
      status_code: 400,
      api_error: {
        type: "invalid_request_error",
        message: "The message ID is required.",
      },
    });
  }

  const queryValidation = PostRetryRequestQuerySchema.safeParse(req.query);
  if (!queryValidation.success) {
    return apiError(req, res, {
      status_code: 400,
      api_error: {
        type: "invalid_request_error",
        message: "The query parameters are invalid.",
      },
    });
  }

  const conversationRes = await getConversation(auth, conversationId);
  if (conversationRes.isErr()) {
    return apiErrorForConversation(req, res, conversationRes.error);
  }

  const conversation = conversationRes.value;

  switch (req.method) {
    case "POST":
      const message = conversation.content
        .flat()
        .find((m) => m.sId === messageId);

      if (!message || !isAgentMessageType(message)) {
        return apiError(req, res, {
          status_code: 400,
          api_error: {
            type: "invalid_request_error",
            message:
              "The message you're trying to retry does not exist or is not an agent message.",
          },
        });
      }

      // If the query parameter `blocked_only` is true, we retry only the blocked actions.
      if (queryValidation.data.blocked_only === "true") {
        const retryBlockedActionsRes = await retryBlockedActions(
          auth,
          conversation,
          {
            messageId,
          }
        );

        if (retryBlockedActionsRes.isErr()) {
          const { error } = retryBlockedActionsRes;

          if (
            error instanceof DustError &&
            error.code === "agent_loop_already_running"
          ) {
            return apiError(req, res, {
              status_code: 400,
              api_error: {
                type: "invalid_request_error",
                message: error.message,
              },
            });
          }

          return apiError(req, res, {
            status_code: 500,
            api_error: {
              type: "invalid_request_error",
              message: "Failed to retry blocked actions.",
            },
          });
        }

        res.status(200).json({ message });
        return;
      }

      const retriedMessageRes = await retryAgentMessage(auth, {
        conversation,
        message,
      });
      if (retriedMessageRes.isErr()) {
        return apiError(req, res, retriedMessageRes.error);
      }

      res.status(200).json({ message: retriedMessageRes.value });
      return;

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

export default withSessionAuthenticationForWorkspace(handler);
