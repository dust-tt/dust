/**
 * @ignoreswagger
 */
import { withSessionAuthenticationForWorkspace } from "@app/lib/api/auth_wrappers";
import type { Authenticator } from "@app/lib/auth";
import { AgentMCPActionResource } from "@app/lib/resources/agent_mcp_action_resource";
import { ConversationResource } from "@app/lib/resources/conversation_resource";
import { apiError } from "@app/logger/withlogging";
import type { AgentMCPActionWithOutputType } from "@app/types/actions";
import type { AgentMessageStatus } from "@app/types/assistant/conversation";
import type { WithAPIErrorResponse } from "@app/types/error";
import { isString } from "@app/types/shared/utils/general";
import type { NextApiRequest, NextApiResponse } from "next";

export type FetchConversationMessageActionResponse = {
  action: AgentMCPActionWithOutputType;
  messageStatus: AgentMessageStatus;
};

async function handler(
  req: NextApiRequest,
  res: NextApiResponse<
    WithAPIErrorResponse<FetchConversationMessageActionResponse>
  >,
  auth: Authenticator
): Promise<void> {
  const { cId, mId, aId } = req.query;

  if (!isString(cId) || !isString(mId) || !isString(aId)) {
    return apiError(req, res, {
      status_code: 400,
      api_error: {
        type: "invalid_request_error",
        message:
          "Invalid query parameters, `cId`, `mId`, and `aId` (strings) are required.",
      },
    });
  }

  switch (req.method) {
    case "GET": {
      const conversation = await ConversationResource.fetchById(auth, cId);
      if (!conversation) {
        return apiError(req, res, {
          status_code: 404,
          api_error: {
            type: "conversation_not_found",
            message: "Conversation not found.",
          },
        });
      }

      const messageRes = await conversation.getMessageById(auth, mId);
      if (messageRes.isErr()) {
        return apiError(req, res, {
          status_code: 404,
          api_error: {
            type: "message_not_found",
            message: "Message not found.",
          },
        });
      }

      const message = messageRes.value;
      if (!message.agentMessage) {
        return apiError(req, res, {
          status_code: 400,
          api_error: {
            type: "invalid_request_error",
            message: "Message is not an agent message.",
          },
        });
      }

      const action = await AgentMCPActionResource.fetchById(auth, aId);
      if (!action || action.agentMessageId !== message.agentMessage.id) {
        return apiError(req, res, {
          status_code: 404,
          api_error: {
            type: "action_not_found",
            message: "Action not found.",
          },
        });
      }

      const [enrichedAction] =
        await AgentMCPActionResource.enrichActionsWithOutputItems(auth, {
          actions: [action],
          ignoreContent: false,
        });

      res.status(200).json({
        action: enrichedAction,
        messageStatus: message.agentMessage.status,
      });
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
