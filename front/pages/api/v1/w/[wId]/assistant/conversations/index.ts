import { isLeft } from "fp-ts/lib/Either";
import * as t from "io-ts";
import * as reporter from "io-ts-reporters";
import { NextApiRequest, NextApiResponse } from "next";

import { createConversation } from "@app/lib/api/assistant/conversation";
import { postUserMessageWithPubSub } from "@app/lib/api/assistant/pubsub";
import { Authenticator, getAPIKey } from "@app/lib/auth";
import { ReturnedAPIErrorType } from "@app/lib/error";
import { apiError, withLogging } from "@app/logger/withlogging";
import { PostMessagesRequestBodySchema } from "@app/pages/api/v1/w/[wId]/assistant/conversations/[cId]/messages";
import { ConversationType } from "@app/types/assistant/conversation";

const PostConversationsRequestBodySchema = t.type({
  title: t.union([t.string, t.null]),
  visibility: t.union([
    t.literal("unlisted"),
    t.literal("workspace"),
    t.literal("deleted"),
  ]),
  message: t.union([PostMessagesRequestBodySchema, t.null]),
});

export type PostConversationsResponseBody = {
  conversation: ConversationType;
};

async function handler(
  req: NextApiRequest,
  res: NextApiResponse<PostConversationsResponseBody | ReturnedAPIErrorType>
): Promise<void> {
  const keyRes = await getAPIKey(req);
  if (keyRes.isErr()) {
    return apiError(req, res, keyRes.error);
  }

  const { auth, keyWorkspaceId } = await Authenticator.fromKey(
    keyRes.value,
    req.query.wId as string
  );

  if (!auth.isBuilder() || keyWorkspaceId !== req.query.wId) {
    return apiError(req, res, {
      status_code: 400,
      api_error: {
        type: "invalid_request_error",
        message: "The Assistant API is only available on your own workspace.",
      },
    });
  }

  const owner = await auth.workspace();
  if (!owner) {
    return apiError(req, res, {
      status_code: 404,
      api_error: {
        type: "workspace_not_found",
        message: "The workspace you're trying to access was not found",
      },
    });
  }

  switch (req.method) {
    case "POST":
      const bodyValidation = PostConversationsRequestBodySchema.decode(
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

      const { title, visibility, message } = bodyValidation.right;

      const conversation = await createConversation(auth, {
        title,
        visibility,
      });

      if (message) {
        // Not awaiting this promise on purpose. We want to answer "OK" to the client ASAP and
        // process the events in the background. So that the client gets updated as soon as
        // possible.
        void postUserMessageWithPubSub(auth, {
          conversation,
          content: message.content,
          mentions: message.mentions,
          context: {
            timezone: message.context.timezone,
            username: message.context.username,
            fullName: message.context.fullName,
            email: message.context.email,
            profilePictureUrl: message.context.profilePictureUrl,
          },
        });
      }

      res.status(200).json({ conversation });
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
