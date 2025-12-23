import type { NextApiRequest, NextApiResponse } from "next";

import { fetchMessageInConversation } from "@app/lib/api/assistant/messages";
import { withSessionAuthenticationForWorkspace } from "@app/lib/api/auth_wrappers";
import type { Authenticator } from "@app/lib/auth";
import { ConversationResource } from "@app/lib/resources/conversation_resource";
import { SkillResource } from "@app/lib/resources/skill/skill_resource";
import { apiError } from "@app/logger/withlogging";
import type { WithAPIErrorResponse } from "@app/types";
import { isString } from "@app/types";
import type { SkillType } from "@app/types/assistant/skill_configuration";

export type GetAgentMessageSkillsResponseBody = {
  skills: SkillType[];
};

async function handler(
  req: NextApiRequest,
  res: NextApiResponse<WithAPIErrorResponse<GetAgentMessageSkillsResponseBody>>,
  auth: Authenticator
): Promise<void> {
  const { cId, mId } = req.query;

  if (!isString(cId)) {
    return apiError(req, res, {
      status_code: 400,
      api_error: {
        type: "invalid_request_error",
        message: "Invalid query parameters, `cId` (string) is required.",
      },
    });
  }

  if (!isString(mId)) {
    return apiError(req, res, {
      status_code: 400,
      api_error: {
        type: "invalid_request_error",
        message: "Invalid query parameters, `mId` (string) is required.",
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

      const message = await fetchMessageInConversation(
        auth,
        conversation.toJSON(),
        mId
      );

      if (!message) {
        return apiError(req, res, {
          status_code: 404,
          api_error: {
            type: "message_not_found",
            message: "Message not found.",
          },
        });
      }

      if (!message.agentMessageId) {
        return apiError(req, res, {
          status_code: 400,
          api_error: {
            type: "invalid_request_error",
            message: "Message is not an agent message.",
          },
        });
      }

      const skills = await SkillResource.listByAgentMessageId(
        auth,
        message.agentMessageId
      );

      res.status(200).json({
        skills: skills.map((skill) => skill.toJSON(auth)),
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
