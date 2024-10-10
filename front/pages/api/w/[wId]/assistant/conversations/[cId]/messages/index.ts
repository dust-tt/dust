import type { UserMessageType, WithAPIErrorResponse } from "@dust-tt/types";
import { InternalPostMessagesRequestBodySchema } from "@dust-tt/types";
import { isLeft } from "fp-ts/lib/Either";
import * as reporter from "io-ts-reporters";
import type { NextApiRequest, NextApiResponse } from "next";

import { getConversation } from "@app/lib/api/assistant/conversation";
import { apiErrorForConversation } from "@app/lib/api/assistant/conversation/helper";
import type { FetchConversationMessagesResponse } from "@app/lib/api/assistant/messages";
import { fetchConversationMessages } from "@app/lib/api/assistant/messages";
import { postUserMessageWithPubSub } from "@app/lib/api/assistant/pubsub";
import { getPaginationParams } from "@app/lib/api/pagination";
import { withSessionAuthenticationForWorkspace } from "@app/lib/api/wrappers";
import type { Authenticator } from "@app/lib/auth";
import { apiError } from "@app/logger/withlogging";

async function handler(
  req: NextApiRequest,
  res: NextApiResponse<
    WithAPIErrorResponse<
      { message: UserMessageType } | FetchConversationMessagesResponse
    >
  >,
  auth: Authenticator
): Promise<void> {
  const user = auth.getNonNullableUser();

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
        return apiErrorForConversation(req, res, messagesRes.error);
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

      const conversationRes = await getConversation(auth, conversationId);

      if (conversationRes.isErr()) {
        return apiErrorForConversation(req, res, conversationRes.error);
      }

      const conversation = conversationRes.value;

      /* postUserMessageWithPubSub returns swiftly since it only waits for the
        initial message creation event (or error) */
      const messageRes = await postUserMessageWithPubSub(
        auth,
        {
          conversation,
          content,
          mentions,
          context: {
            timezone: context.timezone,
            username: user.username,
            fullName: user.fullName,
            email: user.email,
            profilePictureUrl: context.profilePictureUrl ?? user.image,
            origin: "web",
          },
        },
        { resolveAfterFullGeneration: false }
      );
      if (messageRes.isErr()) {
        return apiError(req, res, messageRes.error);
      }

      res.status(200).json({ message: messageRes.value.userMessage });
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
