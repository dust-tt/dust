import { isLeft } from "fp-ts/lib/Either";
import * as t from "io-ts";
import * as reporter from "io-ts-reporters";
import { NextApiRequest, NextApiResponse } from "next";

import {
  createConversation,
  getConversation,
} from "@app/lib/api/assistant/conversation";
import { postUserMessageWithPubSub } from "@app/lib/api/assistant/pubsub";
import { Authenticator, getAPIKey } from "@app/lib/auth";
import { ReturnedAPIErrorType } from "@app/lib/error";
import { apiError, withLogging } from "@app/logger/withlogging";
import { PostMessagesRequestBodySchema } from "@app/pages/api/v1/w/[wId]/assistant/conversations/[cId]/messages";
import {
  ConversationType,
  UserMessageType,
} from "@app/types/assistant/conversation";

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
  message?: UserMessageType;
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
        // If a message was provided we do await for the message to be posted before returning the
        // conversation along with the message.
        const messageRes = await postUserMessageWithPubSub(auth, {
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

        if (messageRes.isErr()) {
          return apiError(req, res, messageRes.error);
        }

        // If we got the user message we know that the agent messages have been created as well, so
        // we pull the conversation again to have the created agent message included so that the
        // user of the API can start streaming events from these agent messages directly.
        const updated = await getConversation(auth, conversation.sId);

        if (!updated) {
          throw `Conversation unexpectedly not found after creation: ${conversation.sId}`;
        }

        res
          .status(200)
          .json({ conversation: updated, message: messageRes.value });
      } else {
        // Otherwise we simply return the conversation created.
        res.status(200).json({ conversation });
      }
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
