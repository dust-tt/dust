/**
 * @swagger
 * /api/w/{wId}/assistant/conversations/{cId}/wakeups:
 *   get:
 *     summary: List wake-ups for a conversation
 *     description: Retrieve all wake-ups scheduled in a conversation (any status).
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
 *         description: Successfully retrieved wake-ups
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 wakeUps:
 *                   type: array
 *                   items:
 *                     $ref: '#/components/schemas/PrivateWakeUp'
 *       401:
 *         description: Unauthorized
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

export type GetConversationWakeUpsResponseBody = {
  wakeUps: WakeUpType[];
};

async function handler(
  req: NextApiRequest,
  res: NextApiResponse<
    WithAPIErrorResponse<GetConversationWakeUpsResponseBody>
  >,
  auth: Authenticator
): Promise<void> {
  const { cId } = req.query;
  if (!isString(cId)) {
    return apiError(req, res, {
      status_code: 400,
      api_error: {
        type: "invalid_request_error",
        message: "Invalid query parameters, `cId` (string) is required.",
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

  switch (req.method) {
    case "GET": {
      const wakeUps = await WakeUpResource.listByConversation(
        auth,
        conversation
      );
      res.status(200).json({ wakeUps: wakeUps.map((w) => w.toJSON()) });
      return;
    }

    default:
      return apiError(req, res, {
        status_code: 405,
        api_error: {
          type: "method_not_supported_error",
          message: "The method passed is not supported, GET is expected.",
        },
      });
  }
}

export default withSessionAuthenticationForWorkspace(handler);
