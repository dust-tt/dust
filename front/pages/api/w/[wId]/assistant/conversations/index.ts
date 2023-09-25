import { isLeft } from "fp-ts/lib/Either";
import * as t from "io-ts";
import * as reporter from "io-ts-reporters";
import { NextApiRequest, NextApiResponse } from "next";

import {
  createConversation,
  getUserConversations,
} from "@app/lib/api/assistant/conversation";
import { postUserMessageWithPubSub } from "@app/lib/api/assistant/pubsub";
import { Authenticator, getSession } from "@app/lib/auth";
import { ReturnedAPIErrorType } from "@app/lib/error";
import { apiError, withLogging } from "@app/logger/withlogging";
import { PostMessagesRequestBodySchema } from "@app/pages/api/w/[wId]/assistant/conversations/[cId]/messages";
import {
  ConversationType,
  ConversationWithoutContentType,
} from "@app/types/assistant/conversation";

export const PostConversationsRequestBodySchema = t.type({
  title: t.union([t.string, t.null]),
  visibility: t.union([
    t.literal("unlisted"),
    t.literal("workspace"),
    t.literal("deleted"),
  ]),
  message: t.union([PostMessagesRequestBodySchema, t.null]),
});

export type GetConversationsResponseBody = {
  conversations: ConversationWithoutContentType[];
};
export type PostConversationsResponseBody = {
  conversation: ConversationType;
};

async function handler(
  req: NextApiRequest,
  res: NextApiResponse<
    | GetConversationsResponseBody
    | PostConversationsResponseBody
    | ReturnedAPIErrorType
    | void
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

  if (!auth.user()) {
    return apiError(req, res, {
      status_code: 404,
      api_error: {
        type: "workspace_user_not_found",
        message: "Could not find the user of the current session.",
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

  switch (req.method) {
    case "GET":
      const conversations = await getUserConversations(auth);
      res.status(200).json({ conversations });
      return;

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
            username: user.username,
            fullName: user.name,
            email: user.email,
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
