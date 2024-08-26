import type {
  ContentFragmentType,
  ConversationType,
  ConversationWithoutContentType,
  UserMessageType,
  WithAPIErrorResponse,
} from "@dust-tt/types";
import { InternalPostConversationsRequestBodySchema } from "@dust-tt/types";
import { isLeft } from "fp-ts/lib/Either";
import * as reporter from "io-ts-reporters";
import type { NextApiRequest, NextApiResponse } from "next";

import {
  createConversation,
  getConversation,
  getUserConversations,
  postNewContentFragment,
} from "@app/lib/api/assistant/conversation";
import { postUserMessageWithPubSub } from "@app/lib/api/assistant/pubsub";
import { withSessionAuthenticationForWorkspaceAsUser } from "@app/lib/api/wrappers";
import type { Authenticator } from "@app/lib/auth";
import { apiError } from "@app/logger/withlogging";

export type GetConversationsResponseBody = {
  conversations: ConversationWithoutContentType[];
};
export type PostConversationsResponseBody = {
  conversation: ConversationType;
  message?: UserMessageType;
  contentFragments: ContentFragmentType[];
};

async function handler(
  req: NextApiRequest,
  res: NextApiResponse<
    WithAPIErrorResponse<
      GetConversationsResponseBody | PostConversationsResponseBody | void
    >
  >,
  auth: Authenticator
): Promise<void> {
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
      const bodyValidation = InternalPostConversationsRequestBodySchema.decode(
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

      const { title, visibility, message, contentFragments } =
        bodyValidation.right;

      let conversation = await createConversation(auth, {
        title,
        visibility,
      });

      const newContentFragments: ContentFragmentType[] = [];
      let newMessage: UserMessageType | null = null;

      const baseContext = {
        username: user.username,
        fullName: user.fullName,
        email: user.email,
      };

      if (contentFragments.length > 0) {
        const newContentFragmentsRes = await Promise.all(
          contentFragments.map((contentFragment) => {
            return postNewContentFragment(auth, conversation, contentFragment, {
              ...baseContext,
              profilePictureUrl: contentFragment.context.profilePictureUrl,
            });
          })
        );

        for (const r of newContentFragmentsRes) {
          if (r.isErr()) {
            if (r.isErr()) {
              return apiError(req, res, {
                status_code: 400,
                api_error: {
                  type: "invalid_request_error",
                  message: r.error.message,
                },
              });
            }
          }

          newContentFragments.push(r.value);
        }

        const updatedConversation = await getConversation(
          auth,
          conversation.sId
        );
        if (updatedConversation) {
          conversation = updatedConversation;
        }
      }

      if (message) {
        // If a message was provided we do await for the message to be created before returning the
        // conversation along with the message. PostUserMessageWithPubSub returns swiftly since it
        // only waits for the initial message creation event (or error) */
        const messageRes = await postUserMessageWithPubSub(
          auth,
          {
            conversation,
            content: message.content,
            mentions: message.mentions,
            context: {
              timezone: message.context.timezone,
              username: user.username,
              fullName: user.fullName,
              email: user.email,
              profilePictureUrl: message.context.profilePictureUrl,
              origin: "web",
            },
          },
          { resolveAfterFullGeneration: false }
        );
        if (messageRes.isErr()) {
          return apiError(req, res, messageRes.error);
        }

        newMessage = messageRes.value.userMessage;
      }

      if (newContentFragments.length > 0 || newMessage) {
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
        contentFragments: newContentFragments,
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

export default withSessionAuthenticationForWorkspaceAsUser(handler);
