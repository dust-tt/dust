/**
 * @swagger
 * /api/w/{wId}/assistant/conversations/{cId}/wakeups/{wuId}:
 *   delete:
 *     summary: Cancel a wake-up
 *     description: Cancel a scheduled wake-up. Only the wake-up owner or a workspace admin can cancel.
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
 *       - in: path
 *         name: wuId
 *         required: true
 *         description: sId of the wake-up to cancel
 *         schema:
 *           type: string
 *     security:
 *       - BearerAuth: []
 *     responses:
 *       200:
 *         description: Successfully cancelled (or already terminal)
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 wakeUp:
 *                   $ref: '#/components/schemas/PrivateWakeUp'
 *       403:
 *         description: Caller is not the wake-up owner or a workspace admin
 *       404:
 *         description: Wake-up not found in this conversation
 */
import { apiErrorForConversation } from "@app/lib/api/assistant/conversation/helper";
import { withSessionAuthenticationForWorkspace } from "@app/lib/api/auth_wrappers";
import type { Authenticator } from "@app/lib/auth";
import { ConversationResource } from "@app/lib/resources/conversation_resource";
import { WakeUpResource } from "@app/lib/resources/wakeup_resource";
import { apiError } from "@app/logger/withlogging";
import type { WakeUpType } from "@app/types/assistant/wakeups";
import type { WithAPIErrorResponse } from "@app/types/error";
import { isString } from "@app/types/shared/utils/general";
import type { NextApiRequest, NextApiResponse } from "next";

export type DeleteConversationWakeUpResponseBody = {
  wakeUp: WakeUpType;
};

async function handler(
  req: NextApiRequest,
  res: NextApiResponse<
    WithAPIErrorResponse<DeleteConversationWakeUpResponseBody>
  >,
  auth: Authenticator
): Promise<void> {
  const { cId, wuId } = req.query;
  if (!isString(cId) || !isString(wuId)) {
    return apiError(req, res, {
      status_code: 400,
      api_error: {
        type: "invalid_request_error",
        message:
          "Invalid query parameters, `cId` and `wuId` (strings) are required.",
      },
    });
  }

  // The fetchConversationWithoutContent method checks for conversation accessibility (inside the
  // resource through `baseFetchWithAuthorization`
  const conversationRes =
    await ConversationResource.fetchConversationWithoutContent(auth, cId);
  if (conversationRes.isErr()) {
    return apiErrorForConversation(req, res, conversationRes.error);
  }
  const conversation = conversationRes.value;

  const wakeUp = await WakeUpResource.fetchById(auth, wuId);
  if (!wakeUp || wakeUp.conversationId !== conversation.id) {
    return apiError(req, res, {
      status_code: 404,
      api_error: {
        type: "wakeup_not_found",
        message: "Wake-up not found in this conversation.",
      },
    });
  }

  switch (req.method) {
    case "DELETE": {
      const cancelRes = await wakeUp.cancel(auth);
      if (cancelRes.isErr()) {
        return apiError(req, res, {
          status_code: 403,
          api_error: {
            type: "workspace_auth_error",
            message: cancelRes.error.message,
          },
        });
      }
      res.status(200).json({ wakeUp: wakeUp.toJSON() });
      return;
    }

    default:
      return apiError(req, res, {
        status_code: 405,
        api_error: {
          type: "method_not_supported_error",
          message: "The method passed is not supported, DELETE is expected.",
        },
      });
  }
}

export default withSessionAuthenticationForWorkspace(handler);
