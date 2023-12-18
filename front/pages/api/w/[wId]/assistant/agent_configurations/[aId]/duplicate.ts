import { AgentConfigurationType } from "@dust-tt/types";
import { ReturnedAPIErrorType } from "@dust-tt/types";
import { NextApiRequest, NextApiResponse } from "next";

import { getAgentConfiguration } from "@app/lib/api/assistant/configuration";
import { Authenticator, getSession } from "@app/lib/auth";
import { apiError, withLogging } from "@app/logger/withlogging";

import { createOrUpgradeAgentConfiguration } from "..";

type GetAgentConfigurationResponseBody = {
  agentConfiguration: AgentConfigurationType;
};

async function handler(
  req: NextApiRequest,
  res: NextApiResponse<GetAgentConfigurationResponseBody | ReturnedAPIErrorType>
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
        message: "The workspace you're trying to modify was not found.",
      },
    });
  }

  if (!auth.isUser()) {
    return apiError(req, res, {
      status_code: 404,
      api_error: {
        type: "app_auth_error",
        message:
          "Only the users that are members for the current workspace can duplicate an Assistant.",
      },
    });
  }

  switch (req.method) {
    case "POST":
      const agentConfiguration = await getAgentConfiguration(
        auth,
        req.query.aId as string
      );
      if (!agentConfiguration) {
        return apiError(req, res, {
          status_code: 404,
          api_error: {
            type: "agent_configuration_not_found",
            message: "The Assistant you're trying to duplicate was not found.",
          },
        });
      }
      if (agentConfiguration.generation === null) {
        return apiError(req, res, {
          status_code: 404,
          api_error: {
            type: "internal_server_error",
            message:
              "The agent confiuration you're trying to duplicate has no generation configuration.",
          },
        });
      }
      const duplicated = await createOrUpgradeAgentConfiguration(auth, {
        assistant: {
          name: `CopyOf${agentConfiguration.name}`,
          description: agentConfiguration.description,
          pictureUrl: agentConfiguration.pictureUrl,
          status: "active",
          scope: "private",
          generation: agentConfiguration.generation,
          action: agentConfiguration.action,
        },
      });
      return res.status(200).json({ agentConfiguration: duplicated });

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
