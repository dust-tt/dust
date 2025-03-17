import type {
  GetConversationsResponseType,
  PostConversationsResponseType,
} from "@dust-tt/client";
import { PublicPostConversationsRequestBodySchema } from "@dust-tt/client";
import type { NextApiRequest, NextApiResponse } from "next";
import { fromError } from "zod-validation-error";

import {
  createConversation,
  getConversation,
  getUserConversations,
  postNewContentFragment,
} from "@app/lib/api/assistant/conversation";
import { toFileContentFragment } from "@app/lib/api/assistant/conversation/content_fragment";
import { apiErrorForConversation } from "@app/lib/api/assistant/conversation/helper";
import { postUserMessageWithPubSub } from "@app/lib/api/assistant/pubsub";
import { withPublicAPIAuthentication } from "@app/lib/api/auth_wrappers";
import type { Authenticator } from "@app/lib/auth";
import { apiError } from "@app/logger/withlogging";
import type {
  ContentFragmentType,
  UserMessageType,
  WithAPIErrorResponse,
} from "@app/types";
import {
  ConversationError,
  isContentFragmentInputWithContentType,
  isEmptyString,
} from "@app/types";

/**
 * @swagger
 * /api/v1/w/{wId}/assistant/conversations:
 *   post:
 *     summary: Create a new conversation
 *     description: Create a new conversation in the workspace identified by {wId}.
 *     tags:
 *       - Conversations
 *     parameters:
 *       - in: path
 *         name: wId
 *         required: true
 *         description: ID of the workspace
 *         schema:
 *           type: string
 *     security:
 *       - BearerAuth: []
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required:
 *               - message
 *             properties:
 *               message:
 *                 $ref: '#/components/schemas/Message'
 *               contentFragments:
 *                 type: array
 *                 items:
 *                   $ref: '#/components/schemas/ContentFragment'
 *                 description: The list of content fragments to attach to this conversation (optional)
 *               blocking:
 *                 type: boolean
 *                 description: Whether to wait for the agent to generate the initial message (if blocking = false, you will need to use streaming events to get the messages)
 *                 example: true
 *               title:
 *                 type: string
 *                 description: The title of the conversation
 *                 example: My conversation
 *               visibility:
 *                 type: string
 *                 description: The visibility of the conversation (The API only accepts `unlisted`)
 *                 enum:
 *                   - workspace
 *                   - unlisted
 *                 example: unlisted
 *     responses:
 *       200:
 *         description: Conversation created successfully.
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/Conversation'
 *       400:
 *         description: Bad Request
 *       401:
 *         description: Unauthorized
 *       500:
 *         description: Internal Server Error
 */

async function handler(
  req: NextApiRequest,
  res: NextApiResponse<
    WithAPIErrorResponse<
      PostConversationsResponseType | GetConversationsResponseType
    >
  >,
  auth: Authenticator
): Promise<void> {
  switch (req.method) {
    case "POST":
      const r = PublicPostConversationsRequestBodySchema.safeParse(req.body);

      if (r.error) {
        return apiError(req, res, {
          status_code: 400,
          api_error: {
            type: "invalid_request_error",
            message: fromError(r.error).toString(),
          },
        });
      }

      const {
        title,
        visibility,
        message,
        contentFragment,
        contentFragments,
        blocking,
      } = r.data;

      if (message) {
        if (isEmptyString(message.context.username)) {
          return apiError(req, res, {
            status_code: 400,
            api_error: {
              type: "invalid_request_error",
              message:
                "The message.context.username must be a non-empty string.",
            },
          });
        }
      }

      const resolvedFragments = contentFragments ?? [];
      if (contentFragment) {
        resolvedFragments.push(contentFragment);
      }

      for (const fragment of resolvedFragments) {
        if (fragment.content) {
          if (
            fragment.content.length === 0 ||
            fragment.content.length > 512 * 1024
          ) {
            return apiError(req, res, {
              status_code: 400,
              api_error: {
                type: "invalid_request_error",
                message:
                  "The content must be a non-empty string of less than 512kB.",
              },
            });
          }
        }
      }

      let conversation = await createConversation(auth, {
        title: title ?? null,
        visibility,
      });

      let newContentFragment: ContentFragmentType | null = null;
      let newMessage: UserMessageType | null = null;

      for (const resolvedFragment of resolvedFragments) {
        const { context, ...rest } = resolvedFragment;
        let contentFragment = rest;

        if (isContentFragmentInputWithContentType(contentFragment)) {
          const contentFragmentRes = await toFileContentFragment(auth, {
            contentFragment,
          });
          if (contentFragmentRes.isErr()) {
            throw new Error(contentFragmentRes.error.message);
          }
          contentFragment = contentFragmentRes.value;
        }

        const cfRes = await postNewContentFragment(
          auth,
          conversation,
          contentFragment,
          {
            username: context?.username ?? null,
            fullName: context?.fullName ?? null,
            email: context?.email ?? null,
            profilePictureUrl: context?.profilePictureUrl ?? null,
          }
        );
        if (cfRes.isErr()) {
          return apiError(req, res, {
            status_code: 400,
            api_error: {
              type: "invalid_request_error",
              message: cfRes.error.message,
            },
          });
        }

        newContentFragment = cfRes.value;
        const updatedConversationRes = await getConversation(
          auth,
          conversation.sId
        );

        if (updatedConversationRes.isErr()) {
          // Preserving former code in which if the conversation was not found here, we do not error
          if (
            !(
              updatedConversationRes.error instanceof ConversationError &&
              updatedConversationRes.error.type === "conversation_not_found"
            )
          ) {
            return apiErrorForConversation(
              req,
              res,
              updatedConversationRes.error
            );
          }
        } else {
          conversation = updatedConversationRes.value;
        }
      }

      if (message) {
        // If a message was provided we do await for the message to be created
        // before returning the conversation along with the message.
        // PostUserMessageWithPubSub returns swiftly since it only waits for the
        // initial message creation event (or error)
        const messageRes = await postUserMessageWithPubSub(
          auth,
          {
            conversation,
            content: message.content,
            mentions: message.mentions,
            context: {
              timezone: message.context.timezone,
              username: message.context.username,
              fullName: message.context.fullName ?? null,
              email: message.context.email ?? null,
              profilePictureUrl: message.context.profilePictureUrl ?? null,
              origin: message.context.origin ?? "api",
            },
          },
          { resolveAfterFullGeneration: blocking === true }
        );

        if (messageRes.isErr()) {
          return apiError(req, res, messageRes.error);
        }

        newMessage = messageRes.value.userMessage;
      }

      if (newContentFragment || newMessage) {
        // If we created a user message or a content fragment (or both) we retrieve the
        // conversation. If a user message was posted, we know that the agent messages have been
        // created as well, so pulling the conversation again will allow to have an up to date view
        // of the conversation with agent messages included so that the user of the API can start
        // streaming events from these agent messages directly.
        const updatedRes = await getConversation(auth, conversation.sId);

        if (updatedRes.isErr()) {
          return apiErrorForConversation(req, res, updatedRes.error);
        }
        conversation = updatedRes.value;
      }

      res.status(200).json({
        // TODO(pr, attach-ds): remove this once type support for content node fragment is added in the public API.
        // Will be tackled by https://github.com/dust-tt/tasks/issues/2388.
        // @ts-expect-error cf above
        conversation,
        message: newMessage ?? undefined,
        // TODO(pr, attach-ds): remove this once type support for content node fragment is added in the public API.
        // Will be tackled by https://github.com/dust-tt/tasks/issues/2388.
        // @ts-expect-error cf above
        contentFragment: newContentFragment ?? undefined,
      });
      return;
    case "GET":
      const conversations = await getUserConversations(auth);
      res.status(200).json({ conversations });
      return;

    default:
      return apiError(req, res, {
        status_code: 405,
        api_error: {
          type: "method_not_supported_error",
          message:
            "The method passed is not supported, POST or GET is expected.",
        },
      });
  }
}

export default withPublicAPIAuthentication(handler, {
  requiredScopes: { GET: "read:conversation", POST: "create:conversation" },
});
