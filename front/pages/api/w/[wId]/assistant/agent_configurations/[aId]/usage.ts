import type { AgentUsageType } from "@dust-tt/types";
import type { ReturnedAPIErrorType } from "@dust-tt/types";
import type { NextApiRequest, NextApiResponse } from "next";

import { getAgentUsage } from "@app/lib/api/assistant/agent_usage";
import { getAgentConfiguration } from "@app/lib/api/assistant/configuration";
import { Authenticator, getSession } from "@app/lib/auth";
import { apiError, withLogging } from "@app/logger/withlogging";

export type GetAgentUsageResponseBody = {
  agentUsage: AgentUsageType;
};

async function handler(
  req: NextApiRequest,
  res: NextApiResponse<GetAgentUsageResponseBody | ReturnedAPIErrorType>
): Promise<void> {
  const session = await getSession(req, res);
  const auth = await Authenticator.fromSession(
    session,
    req.query.wId as string
  );
  const owner = auth.workspace();
  if (!owner) {
    return apiError(req, res, {
      status_code: 404,
      api_error: {
        type: "workspace_not_found",
        message: "The workspace you're trying to access was not found.",
      },
    });
  }

  if (!auth.isUser()) {
    return apiError(req, res, {
      status_code: 404,
      api_error: {
        type: "app_auth_error",
        message:
          "Only the users that are members for the current workspace can access the workspace's assistants.",
      },
    });
  }

  switch (req.method) {
    case "GET":
      const agentConfiguration = await getAgentConfiguration(
        auth,
        req.query.aId as string
      );
      if (!agentConfiguration) {
        return apiError(req, res, {
          status_code: 404,
          api_error: {
            type: "agent_configuration_not_found",
            message: "The Assistant you're trying to access was not found.",
          },
        });
      }
      const agentUsage = await getAgentUsage({
        agentConfigurationId: agentConfiguration.sId,
        workspaceId: owner.sId,
      });
      return res.status(200).json({ agentUsage });

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
