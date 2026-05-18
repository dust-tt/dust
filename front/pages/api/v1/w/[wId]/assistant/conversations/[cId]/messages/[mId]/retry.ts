import { retryAgentMessage } from "@app/lib/api/assistant/conversation";
import { getConversation } from "@app/lib/api/assistant/conversation/fetch";
import { apiErrorForConversation } from "@app/lib/api/assistant/conversation/helper";
import { withPublicAPIAuthentication } from "@app/lib/api/auth_wrappers";
import { addBackwardCompatibleAgentMessageFields } from "@app/lib/api/v1/backward_compatibility";
import type { Authenticator } from "@app/lib/auth";
import { ConversationResource } from "@app/lib/resources/conversation_resource";
import { apiError } from "@app/logger/withlogging";
import { isAgentMessageType } from "@app/types/assistant/conversation";
import type { WithAPIErrorResponse } from "@app/types/error";
import type { RetryMessageResponseType } from "@dust-tt/client";
import type { NextApiRequest, NextApiResponse } from "next";
import { z } from "zod";
import { fromError } from "zod-validation-error";

export const PostRetryRequestBodySchema = z.union([
  z.null(),
  z.undefined(),
  z.literal(""),
  z.object({}),
]);

/**
 * @ignoreswagger
 * Not documented yet.
 * TODO(Ext)
 */

async function handler(
  req: NextApiRequest,

  res: NextApiResponse<WithAPIErrorResponse<RetryMessageResponseType>>,
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

  if (!(typeof req.query.mId === "string")) {
    return apiError(req, res, {
      status_code: 400,
      api_error: {
        type: "invalid_request_error",
        message: "Invalid query parameters, `mId` (string) is required.",
      },
    });
  }
  const conversationId = req.query.cId;
  const messageId = req.query.mId;

  const conversationResource = await ConversationResource.fetchById(
    auth,
    conversationId
  );

  if (!conversationResource) {
    return apiError(req, res, {
      status_code: 404,
      api_error: {
        type: "conversation_not_found",
        message: "Conversation not found.",
      },
    });
  }

  const messageRes = await conversationResource.getMessageById(auth, messageId);

  if (messageRes.isErr()) {
    return apiError(req, res, {
      status_code: 404,
      api_error: {
        type: "message_not_found",
        message:
          "The message you're trying to retry does not exist or is not accessible.",
      },
    });
  }

  const branchId = messageRes.value.getBranchId() ?? null;

  const conversationRes = await getConversation(
    auth,
    conversationId,
    false,
    branchId
  );

  if (conversationRes.isErr()) {
    return apiErrorForConversation(req, res, conversationRes.error);
  }

  const conversation = conversationRes.value;

  switch (req.method) {
    case "POST":
      const bodyValidation = PostRetryRequestBodySchema.safeParse(req.body);

      if (!bodyValidation.success) {
        return apiError(req, res, {
          status_code: 400,
          api_error: {
            type: "invalid_request_error",
            message: `Invalid request body: ${fromError(bodyValidation.error).toString()}`,
          },
        });
      }

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

      const retriedMessageRes = await retryAgentMessage(auth, {
        conversation,
        message,
      });
      if (retriedMessageRes.isErr()) {
        return apiError(req, res, retriedMessageRes.error);
      }

      res.status(200).json({
        message: addBackwardCompatibleAgentMessageFields(
          retriedMessageRes.value
        ),
      });
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

export default withPublicAPIAuthentication(handler, {
  isStreaming: true,
});
