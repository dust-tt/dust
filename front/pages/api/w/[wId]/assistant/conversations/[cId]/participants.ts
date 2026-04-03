/**
 * @swagger
 * /api/w/{wId}/assistant/conversations/{cId}/participants:
 *   get:
 *     summary: Get conversation participants
 *     description: Returns the participants of a specific conversation.
 *     tags:
 *       - Private Conversations
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
 *     security:
 *       - BearerAuth: []
 *     responses:
 *       200:
 *         description: Success
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 participants:
 *                   type: object
 *                   properties:
 *                     agents:
 *                       type: array
 *                       items:
 *                         type: object
 *                         properties:
 *                           configurationId:
 *                             type: string
 *                           configurationName:
 *                             type: string
 *                     users:
 *                       type: array
 *                       items:
 *                         type: object
 *                         properties:
 *                           username:
 *                             type: string
 *                           fullName:
 *                             type: string
 *                             nullable: true
 *                           pictureUrl:
 *                             type: string
 *                             nullable: true
 *       401:
 *         description: Unauthorized
 *   post:
 *     summary: Add a participant to a conversation
 *     description: Adds the authenticated user as a participant to a specific conversation.
 *     tags:
 *       - Private Conversations
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
 *     security:
 *       - BearerAuth: []
 *     responses:
 *       201:
 *         description: Successfully added participant
 *       401:
 *         description: Unauthorized
 */
import { apiErrorForConversation } from "@app/lib/api/assistant/conversation/helper";
import { fetchConversationParticipants } from "@app/lib/api/assistant/participants";
import { withSessionAuthenticationForWorkspace } from "@app/lib/api/auth_wrappers";
import { withResourceFetchingFromRoute } from "@app/lib/api/resource_wrappers";
import type { Authenticator } from "@app/lib/auth";
import { ConversationResource } from "@app/lib/resources/conversation_resource";
import { apiError } from "@app/logger/withlogging";
import type {
  ConversationParticipantsType,
  UserMessageType,
} from "@app/types/assistant/conversation";
import { ConversationError } from "@app/types/assistant/conversation";
import type { WithAPIErrorResponse } from "@app/types/error";
import type { NextApiRequest, NextApiResponse } from "next";

export type FetchConversationParticipantsResponse = {
  participants: ConversationParticipantsType;
};

async function handler(
  req: NextApiRequest,
  res: NextApiResponse<
    WithAPIErrorResponse<
      { message: UserMessageType } | FetchConversationParticipantsResponse
    >
  >,
  auth: Authenticator,
  { conversation }: { conversation: ConversationResource }
): Promise<void> {
  const conversationWithoutContent = conversation.toJSON();

  switch (req.method) {
    case "GET":
      const participantsRes = await fetchConversationParticipants(
        auth,
        conversationWithoutContent
      );
      if (participantsRes.isErr()) {
        return apiError(req, res, {
          status_code: 404,
          api_error: {
            type: "conversation_not_found",
            message: "Conversation not found",
          },
        });
      }

      res.status(200).json({ participants: participantsRes.value });
      break;

    case "POST":
      const u = auth.user();
      if (!u) {
        return apiError(req, res, {
          status_code: 401,
          api_error: {
            type: "app_auth_error",
            message: "User not authenticated",
          },
        });
      }

      const user = u.toJSON();

      const isAlreadyParticipant =
        await ConversationResource.isConversationParticipant(auth, {
          conversation: conversationWithoutContent,
          user,
        });

      if (isAlreadyParticipant) {
        return apiErrorForConversation(
          req,
          res,
          new ConversationError("user_already_participant")
        );
      }

      await ConversationResource.upsertParticipation(auth, {
        conversation: conversationWithoutContent,
        user,
        action: "subscribed",
        lastReadAt: new Date(),
      });

      res.status(201).end();
      break;

    default:
      return apiError(req, res, {
        status_code: 405,
        api_error: {
          type: "method_not_supported_error",
          message:
            "The method passed is not supported, GET or POST is expected.",
        },
      });
  }
}

export default withSessionAuthenticationForWorkspace(
  withResourceFetchingFromRoute(handler, { conversation: {} })
);
