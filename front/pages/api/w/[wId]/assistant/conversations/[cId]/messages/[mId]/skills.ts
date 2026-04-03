/** @ignoreswagger */
import { withSessionAuthenticationForWorkspace } from "@app/lib/api/auth_wrappers";
import { withResourceFetchingFromRoute } from "@app/lib/api/resource_wrappers";
import type { Authenticator } from "@app/lib/auth";
import type { ConversationResource } from "@app/lib/resources/conversation_resource";
import { SkillResource } from "@app/lib/resources/skill/skill_resource";
import { apiError } from "@app/logger/withlogging";
import type { SkillType } from "@app/types/assistant/skill_configuration";
import type { WithAPIErrorResponse } from "@app/types/error";
import { isString } from "@app/types/shared/utils/general";
import type { NextApiRequest, NextApiResponse } from "next";

export type GetAgentMessageSkillsResponseBody = {
  skills: SkillType[];
};

async function handler(
  req: NextApiRequest,
  res: NextApiResponse<WithAPIErrorResponse<GetAgentMessageSkillsResponseBody>>,
  auth: Authenticator,
  { conversation }: { conversation: ConversationResource }
): Promise<void> {
  const { mId } = req.query;

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

      if (!messageRes.value.agentMessageId) {
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
        messageRes.value.agentMessageId
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

export default withSessionAuthenticationForWorkspace(
  withResourceFetchingFromRoute(handler, { conversation: {} })
);
