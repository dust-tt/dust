import type {
  ContentFragmentType,
  ConversationType,
  UserMessageType,
  WithAPIErrorResponse,
} from "@dust-tt/types";
import {
  isEmptyString,
  PublicPostConversationsRequestBodySchema,
} from "@dust-tt/types";
import { isLeft } from "fp-ts/lib/Either";
import * as reporter from "io-ts-reporters";
import type { NextApiRequest, NextApiResponse } from "next";

import {
  createConversation,
  getConversation,
  normalizeContentFragmentType,
  postNewContentFragment,
} from "@app/lib/api/assistant/conversation";
import { postUserMessageWithPubSub } from "@app/lib/api/assistant/pubsub";
import { Authenticator, getAPIKey } from "@app/lib/auth";
import { apiError, withLogging } from "@app/logger/withlogging";

export type PostConversationsResponseBody = {
  conversation: ConversationType;
  message?: UserMessageType;
  contentFragment?: ContentFragmentType;
};

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
 *             properties:
 *               message:
 *                 $ref: '#/components/schemas/Message'
 *               contentFragment:
 *                 $ref: '#/components/schemas/ContentFragment'
 *               blocking:
 *                 type: boolean
 *                 description: Whether to wait for the agent to generate the initial message (if blocking = false, you will need to use streaming events to get the messages)
 *                 default: true
 *                 example: true
 *               title:
 *                 type: string
 *                 description: The title of the conversation
 *                 nullable: true
 *                 example: My conversation
 *               visibility:
 *                 type: string
 *                 description: The visibility of the conversation (The API only accepts `unlisted`)
 *                 enum:
 *                   - workspace
 *                   - unlisted
 *                 default: unlisted
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
  res: NextApiResponse<WithAPIErrorResponse<PostConversationsResponseBody>>
): Promise<void> {
  const keyRes = await getAPIKey(req);
  if (keyRes.isErr()) {
    return apiError(req, res, keyRes.error);
  }

  const authenticator = await Authenticator.fromKey(
    keyRes.value,
    req.query.wId as string
  );
  let { auth } = authenticator;
  const { keyWorkspaceId } = authenticator;

  if (!auth.isBuilder() || keyWorkspaceId !== req.query.wId) {
    return apiError(req, res, {
      status_code: 400,
      api_error: {
        type: "invalid_request_error",
        message: "The Assistant API is only available on your own workspace.",
      },
    });
  }

  const owner = auth.workspace();
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
      const bodyValidation = PublicPostConversationsRequestBodySchema.decode(
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

      const { title, visibility, message, contentFragment, blocking } =
        bodyValidation.right;

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

      if (contentFragment) {
        if (
          contentFragment.content.length === 0 ||
          contentFragment.content.length > 64 * 1024
        ) {
          return apiError(req, res, {
            status_code: 400,
            api_error: {
              type: "invalid_request_error",
              message:
                "The content must be a non-empty string of less than 64kb.",
            },
          });
        }
      }

      // /!\ This is reserved for internal use!
      // If the header "x-api-user-email" is present and valid,
      // associate the message with the provided user email if it belongs to the same workspace.
      const userEmailFromHeader = req.headers["x-api-user-email"];
      if (typeof userEmailFromHeader === "string") {
        auth =
          (await auth.exchangeSystemKeyForUserAuthByEmail(auth, {
            userEmail: userEmailFromHeader,
          })) ?? auth;
      }

      let conversation = await createConversation(auth, {
        title,
        visibility,
      });

      let newContentFragment: ContentFragmentType | null = null;
      let newMessage: UserMessageType | null = null;

      if (contentFragment) {
        const contentType = normalizeContentFragmentType({
          contentType: contentFragment.contentType,
          url: req.url,
        });

        const cfRes = await postNewContentFragment(
          auth,
          conversation,
          {
            ...contentFragment,
            contentType,
          },
          {
            username: contentFragment.context?.username || null,
            fullName: contentFragment.context?.fullName || null,
            email: contentFragment.context?.email || null,
            profilePictureUrl:
              contentFragment.context?.profilePictureUrl || null,
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
        const updatedConversation = await getConversation(
          auth,
          conversation.sId
        );
        if (updatedConversation) {
          conversation = updatedConversation;
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
              fullName: message.context.fullName,
              email: message.context.email,
              profilePictureUrl: message.context.profilePictureUrl,
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
