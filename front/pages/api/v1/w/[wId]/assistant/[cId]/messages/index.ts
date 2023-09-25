import { isLeft } from "fp-ts/lib/Either";
import * as t from "io-ts";
import * as reporter from "io-ts-reporters";
import { NextApiRequest, NextApiResponse } from "next";

import { getConversation } from "@app/lib/api/assistant/conversation";
import { postUserMessageWithPubSub } from "@app/lib/api/assistant/pubsub";
import { Authenticator, getAPIKey } from "@app/lib/auth";
import { ReturnedAPIErrorType } from "@app/lib/error";
import { apiError, withLogging } from "@app/logger/withlogging";
import { UserMessageType } from "@app/types/assistant/conversation";

export type PostMessagesResponseBody = {
  message: UserMessageType;
};

export const PostMessagesRequestBodySchema = t.type({
  content: t.string,
  mentions: t.array(
    t.union([
      t.type({ configurationId: t.string }),
      t.type({
        provider: t.string,
        providerId: t.string,
      }),
    ])
  ),
  context: t.type({
    timezone: t.string,
    username: t.string,
    fullName: t.union([t.string, t.null]),
    email: t.union([t.string, t.null]),
    profilePictureUrl: t.union([t.string, t.null]),
  }),
});

async function handler(
  req: NextApiRequest,
  res: NextApiResponse<{ message: UserMessageType } | ReturnedAPIErrorType>
): Promise<void> {
  const keyRes = await getAPIKey(req);
  if (keyRes.isErr()) {
    return apiError(req, res, keyRes.error);
  }

  const { auth, keyWorkspaceId } = await Authenticator.fromKey(
    keyRes.value,
    req.query.wId as string
  );

  if (!keyRes.value.isSystem) {
    return apiError(req, res, {
      status_code: 400,
      api_error: {
        type: "invalid_request_error",
        message:
          "The Assitant API is only accessible by system API Key. Ping us at team@dust.tt if you want access to it.",
      },
    });
  }

  if (keyWorkspaceId !== req.query.wId) {
    return apiError(req, res, {
      status_code: 400,
      api_error: {
        type: "invalid_request_error",
        message: "The Assistant API is only available on your own workspace.",
      },
    });
  }

  const conversation = await getConversation(auth, req.query.cId as string);
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
    case "POST":
      const bodyValidation = PostMessagesRequestBodySchema.decode(req.body);
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

      const messageRes = await postUserMessageWithPubSub(auth, {
        conversation,
        content,
        mentions,
        context,
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
