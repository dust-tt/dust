import type { UserMessageType, WithAPIErrorReponse } from "@dust-tt/types";
import { InternalPostMessagesRequestBodySchema } from "@dust-tt/types";
import { isLeft } from "fp-ts/lib/Either";
import * as reporter from "io-ts-reporters";
import type { NextApiRequest, NextApiResponse } from "next";

import { getConversation } from "@app/lib/api/assistant/conversation";
import type { FetchConversationMessagesResponse } from "@app/lib/api/assistant/messages";
import { fetchConversationMessages } from "@app/lib/api/assistant/messages";
import { postUserMessageWithPubSub } from "@app/lib/api/assistant/pubsub";
import { getPaginationParams } from "@app/lib/api/pagination";
import { Authenticator, getSession } from "@app/lib/auth";
import { apiError, withLogging } from "@app/logger/withlogging";

async function handler(
  req: NextApiRequest,
  res: NextApiResponse<
    WithAPIErrorReponse<
      { message: UserMessageType } | FetchConversationMessagesResponse
    >
  >
): Promise<void> {
  const session = await getSession(req, res);
  const auth = await Authenticator.fromSession(
    session,
    req.query.wId as string
  );

  const owner = auth.workspace();
  if (!owner) {
    return apiError(req, res, {
      status_code: 404,
      api_error: {
        type: "workspace_not_found",
        message: "The workspace you're trying to modify was not found.",
      },
    });
  }

  const user = auth.user();
  if (!user) {
    return apiError(req, res, {
      status_code: 404,
      api_error: {
        type: "workspace_user_not_found",
        message: "Could not find the user of the current session.",
      },
    });
  }

  if (!auth.isUser()) {
    return apiError(req, res, {
      status_code: 403,
      api_error: {
        type: "workspace_auth_error",
        message:
          "Only users of the current workspace can update chat sessions.",
      },
    });
  }
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
  const conversation = await getConversation(auth, conversationId);
  if (!conversation) {
    return apiError(req, res, {
      status_code: 404,
      api_error: {
        type: "conversation_not_found",
        message: "Conversation not found.",
      },
    });
  }

  switch (req.method) {
    case "GET":
      const paginationRes = getPaginationParams(req, {
        defaultLimit: 10,
        defaultOrderColumn: "rank",
        defaultOrderDirection: "desc",
        supportedOrderColumn: ["rank"],
      });
      if (paginationRes.isErr()) {
        return apiError(
          req,
          res,
          {
            status_code: 400,
            api_error: {
              type: "invalid_pagination_parameters",
              message: "Invalid pagination parameters",
            },
          },
          paginationRes.error
        );
      }

      const messagesRes = await fetchConversationMessages(
        auth,
        conversationId,
        paginationRes.value
      );

      if (messagesRes.isErr()) {
        return apiError(req, res, {
          status_code: 404,
          api_error: {
            type: "conversation_not_found",
            message: "Conversation not found",
          },
        });
      }

      res.status(200).json(messagesRes.value);
      break;

    case "POST":
      const bodyValidation = InternalPostMessagesRequestBodySchema.decode(
        req.body
      );

      if (isLeft(bodyValidation)) {
        const pathError = reporter.formatValidationErrors(bodyValidation.left);

        return apiError(req, res, {
          status_code: 400,
          api_error: {
            type: "invalid_request_error",
            message: `Invalid request body: ${pathError}`,
          },
        });
      }

      const { content, context, mentions } = bodyValidation.right;

      /* postUserMessageWithPubSub returns swiftly since it only waits for the
        initial message creation event (or error) */
      const messageRes = await postUserMessageWithPubSub(auth, {
        conversation,
        content,
        mentions,
        context: {
          timezone: context.timezone,
          username: user.username,
          fullName: user.fullName,
          email: user.email,
          profilePictureUrl: context.profilePictureUrl,
        },
      });
      if (messageRes.isErr()) {
        return apiError(req, res, messageRes.error);
      }

      res.status(200).json({ message: messageRes.value });
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

export default withLogging(handler);
