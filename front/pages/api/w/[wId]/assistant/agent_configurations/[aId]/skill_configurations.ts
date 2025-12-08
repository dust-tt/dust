import type { NextApiRequest, NextApiResponse } from "next";

import { getAgentConfiguration } from "@app/lib/api/assistant/configuration/agent";
import { withSessionAuthenticationForWorkspace } from "@app/lib/api/auth_wrappers";
import type { Authenticator } from "@app/lib/auth";
import { SkillConfigurationResource } from "@app/lib/resources/skill_configuration_resource";
import { apiError } from "@app/logger/withlogging";
import type { WithAPIErrorResponse } from "@app/types";
import { isGlobalAgentId, isString } from "@app/types";
import type { SkillConfiguration } from "@app/types/skill_configuration";

export interface GetAgentSkillsResponseBody {
  skills: SkillConfiguration[];
}

async function handler(
  req: NextApiRequest,
  res: NextApiResponse<WithAPIErrorResponse<GetAgentSkillsResponseBody>>,
  auth: Authenticator
): Promise<void> {
  const { aId } = req.query;
  if (!isString(aId)) {
    return apiError(req, res, {
      status_code: 400,
      api_error: {
        type: "invalid_request_error",
        message: "Invalid agent configuration ID.",
      },
    });
  }

  const agent = await getAgentConfiguration(auth, {
    agentId: aId,
    variant: "light",
  });
  if (!agent) {
    return apiError(req, res, {
      status_code: 404,
      api_error: {
        type: "agent_configuration_not_found",
        message: "The agent configuration was not found.",
      },
    });
  }

  switch (req.method) {
    case "GET": {
      if (isGlobalAgentId(agent.sId)) {
        // TODO(skills): Implement fetching skills for global agents
        return res.status(200).json({
          skills: [],
        });
      }

      const skills =
        await SkillConfigurationResource.fetchByAgentConfigurationId(
          auth,
          agent.id
        );

      return res.status(200).json({
        skills: skills.map((s) => s.toJSON()),
      });
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
