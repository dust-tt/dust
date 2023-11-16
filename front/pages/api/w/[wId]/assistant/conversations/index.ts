import { isLeft } from "fp-ts/lib/Either";
import * as t from "io-ts";
import * as reporter from "io-ts-reporters";
import { NextApiRequest, NextApiResponse } from "next";

import {
  createConversation,
  getConversation,
  getUserConversations,
  postNewContentFragment,
} from "@app/lib/api/assistant/conversation";
import { postUserMessageWithPubSub } from "@app/lib/api/assistant/pubsub";
import { Authenticator, getSession } from "@app/lib/auth";
import { ReturnedAPIErrorType } from "@app/lib/error";
import { apiError, withLogging } from "@app/logger/withlogging";
import { PostContentFragmentRequestBodySchema } from "@app/pages/api/w/[wId]/assistant/conversations/[cId]/content_fragment";
import { PostMessagesRequestBodySchema } from "@app/pages/api/w/[wId]/assistant/conversations/[cId]/messages";
import {
  ContentFragmentType,
  ConversationType,
  ConversationWithoutContentType,
  UserMessageType,
} from "@app/types/assistant/conversation";

export const PostConversationsRequestBodySchema = t.type({
  title: t.union([t.string, t.null]),
  visibility: t.union([
    t.literal("unlisted"),
    t.literal("workspace"),
    t.literal("deleted"),
  ]),
  message: t.union([PostMessagesRequestBodySchema, t.null]),
  contentFragment: t.union([PostContentFragmentRequestBodySchema, t.undefined]),
});

export type GetConversationsResponseBody = {
  conversations: ConversationWithoutContentType[];
};
export type PostConversationsResponseBody = {
  conversation: ConversationType;
  message?: UserMessageType;
  contentFragment?: ContentFragmentType;
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

      const { title, visibility, message, contentFragment } =
        bodyValidation.right;

      let conversation = await createConversation(auth, {
        title,
        visibility,
      });

      let newContentFragment: ContentFragmentType | null = null;
      let newMessage: UserMessageType | null = null;

      if (contentFragment) {
        const cf = await postNewContentFragment(auth, {
          conversation,
          title: contentFragment.title,
          content: contentFragment.content,
          url: contentFragment.url,
          contentType: contentFragment.contentType,
          context: {
            username: user.username,
            fullName: user.fullName,
            email: user.email,
            profilePictureUrl: contentFragment.context.profilePictureUrl,
          },
        });

        newContentFragment = cf;
        const updatedConversation = await getConversation(
          auth,
          conversation.sId
        );
        if (updatedConversation) {
          conversation = updatedConversation;
        }
      }

      if (message) {
        /* If a message was provided we do await for the message to be created
        before returning the conversation along with the message.
        PostUserMessageWithPubSub returns swiftly since it only waits for the
        initial message creation event (or error) */
        const messageRes = await postUserMessageWithPubSub(auth, {
          conversation,
          content: message.content,
          mentions: message.mentions,
          context: {
            timezone: message.context.timezone,
            username: user.username,
            fullName: user.fullName,
            email: user.email,
            profilePictureUrl: message.context.profilePictureUrl,
          },
        });
        if (messageRes.isErr()) {
          return apiError(req, res, messageRes.error);
        }

        newMessage = messageRes.value;
      }

      if (newContentFragment || newMessage) {
        // If we created a user message or a content fragment (or both) we retrieve the
        // conversation. If a user message was posted, we know that the agent messages have been
        // created as well, so pulling the conversation again will allow to have an up to date view
        // of the conversation with agent messages included so that the user of the API can start
        // streaming events from these agent messages directly.
        const updated = await getConversation(auth, conversation.sId);

        if (!updated) {
          throw `Conversation unexpectedly not found after creation: ${conversation.sId}`;
        }

        conversation = updated;
      }

      res.status(200).json({
        conversation,
        message: newMessage ?? undefined,
        contentFragment: newContentFragment ?? undefined,
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

export default withLogging(handler);
