import type { NextApiRequest, NextApiResponse } from "next";

import type { AgentBuilderAction } from "@app/components/agent_builder/AgentBuilderFormContext";
import { transformActionsToFormData } from "@app/components/agent_builder/transformAgentConfiguration";
import { getAgentConfiguration } from "@app/lib/api/assistant/configuration";
import { withSessionAuthenticationForWorkspace } from "@app/lib/api/auth_wrappers";
import type { Authenticator } from "@app/lib/auth";
import { apiError } from "@app/logger/withlogging";
import type { WithAPIErrorResponse } from "@app/types";

export type GetAgentActionsResponseBody = {
  actions: AgentBuilderAction[];
};

async function handler(
  req: NextApiRequest,
  res: NextApiResponse<WithAPIErrorResponse<GetAgentActionsResponseBody>>,
  auth: Authenticator
): Promise<void> {
  if (req.method !== "GET") {
    return apiError(req, res, {
      status_code: 405,
      api_error: {
        type: "method_not_supported_error",
        message: "The method passed is not supported, GET is expected.",
      },
    });
  }

  const { aId } = req.query;
  if (typeof aId !== "string") {
    return apiError(req, res, {
      status_code: 400,
      api_error: {
        type: "invalid_request_error",
        message: "Invalid agent ID.",
      },
    });
  }

  try {
    const agentConfiguration = await getAgentConfiguration(auth, aId, "full");
    if (!agentConfiguration) {
      return apiError(req, res, {
        status_code: 404,
        api_error: {
          type: "agent_configuration_not_found",
          message: "Agent configuration not found.",
        },
      });
    }

    const actions = transformActionsToFormData(
      agentConfiguration.actions || [],
      agentConfiguration.visualizationEnabled
    );

    if (
      agentConfiguration.scope !== "visible" &&
      agentConfiguration.scope !== "hidden"
    ) {
      throw new Error("Invalid agent scope");
    }

    res.status(200).json({ actions });
  } catch (error) {
    return apiError(req, res, {
      status_code: 500,
      api_error: {
        type: "internal_server_error",
        message: "Failed to fetch agent actions.",
      },
    });
  }
}

export default withSessionAuthenticationForWorkspace(handler);
