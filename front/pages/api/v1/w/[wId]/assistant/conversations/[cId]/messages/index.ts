import type {
  AgentMessageType,
  UserMessageType,
  WithAPIErrorResponse,
} from "@dust-tt/types";
import {
  isEmptyString,
  PublicPostMessagesRequestBodySchema,
} from "@dust-tt/types";
import { isLeft } from "fp-ts/lib/Either";
import * as reporter from "io-ts-reporters";
import type { NextApiRequest, NextApiResponse } from "next";

import { getConversation } from "@app/lib/api/assistant/conversation";
import { postUserMessageWithPubSub } from "@app/lib/api/assistant/pubsub";
import { Authenticator, getAPIKey } from "@app/lib/auth";
import { apiError, withLogging } from "@app/logger/withlogging";

export type PostMessagesResponseBody = {
  message: UserMessageType;
  agentMessages?: AgentMessageType[];
};

/**
 * @swagger
 * /api/v1/w/{wId}/assistant/conversations/{cId}/messages:
 *   post:
 *     summary: Create a message
 *     description: Create a message in the workspace identified by {wId}.
 *     tags:
 *       - Conversations
 *     parameters:
 *       - in: path
 *         name: wId
 *         required: true
 *         description: ID of the workspace
 *         schema:
 *           type: string
 *       - in: path
 *         name: cId
 *         required: true
 *         description: ID of the conversation
 *         schema:
 *           type: string
 *       - in: header
 *         name: Authorization
 *         required: true
 *         description: Bearer token for authentication
 *         schema:
 *           type: string
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             properties:
 *               content:
 *                 type: string
 *                 description: The content of the message
 *                 example: This is my message
 *               mentions:
 *                 type: array
 *                 items:
 *                   type: object
 *                   description: The mentions of the message, where configurationId is the ID of the assistant mentioned.
 *                   properties:
 *                     configurationId:
 *                       type: string
 *                       example: [{ "configurationId":"dust" }]
 *               context:
 *                 type: object
 *                 properties:
 *                   timezone:
 *                     type: string
 *                     description: The timezone of the user who created the message
 *                     example: Europe/Paris
 *                   username:
 *                     type: string
 *                     description: The username of the user who created the message
 *                     example: johndoe
 *                   fullName:
 *                     type: string
 *                     description: The full name of the user who created the message
 *                     example: John Doe
 *                     nullable: true
 *                   email:
 *                     type: string
 *                     description: The email of the user who created the message
 *                     example: johndoe@example.com
 *                     nullable: true
 *                   profilePictureUrl:
 *                     type: string
 *                     nullable: true
 *                     description: The profile picture URL of the user who created the message
 *                     example: https://example.com/profile_picture.jpg
 *                   origin:
 *                     type: string
 *                     nullable: true
 *                     description: The origin of the message
 *                     enum:
 *                       - api
 *                       - web
 *                       - slack
 *                       - 'null'
 *                     default: api
 *                     example: api
 *     responses:
 *       200:
 *         description: Message created successfully.
 *       400:
 *         description: Bad Request. Missing or invalid parameters.
 *       401:
 *         description: Unauthorized. Invalid or missing authentication token.
 *       500:
 *         description: Internal Server Error.
 */

async function handler(
  req: NextApiRequest,
  res: NextApiResponse<WithAPIErrorResponse<PostMessagesResponseBody>>
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
      const bodyValidation = PublicPostMessagesRequestBodySchema.decode(
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

      const { content, context, mentions, blocking } = bodyValidation.right;

      if (isEmptyString(context.username)) {
        return apiError(req, res, {
          status_code: 400,
          api_error: {
            type: "invalid_request_error",
            message: "The context.username field is required.",
          },
        });
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

      const messageRes = await postUserMessageWithPubSub(
        auth,
        {
          conversation,
          content,
          mentions,
          context: {
            ...context,
            origin: context.origin ?? "api",
          },
        },
        { resolveAfterFullGeneration: blocking === true }
      );
      if (messageRes.isErr()) {
        return apiError(req, res, messageRes.error);
      }

      res.status(200).json({
        message: messageRes.value.userMessage,
        agentMessages: messageRes.value.agentMessages ?? undefined,
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
