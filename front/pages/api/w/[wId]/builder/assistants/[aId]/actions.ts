import type { NextApiRequest, NextApiResponse } from "next";

import type { AgentBuilderMCPConfiguration } from "@app/components/agent_builder/types";
import {
  buildInitialActions,
  getAccessibleSourcesAndAppsForActions,
} from "@app/lib/agent_builder/server_side_props_helpers";
import { getAgentConfiguration } from "@app/lib/api/assistant/configuration/agent";
import { withSessionAuthenticationForWorkspace } from "@app/lib/api/auth_wrappers";
import type { Authenticator } from "@app/lib/auth";
import { apiError } from "@app/logger/withlogging";
import type { WithAPIErrorResponse } from "@app/types";

export type GetActionsResponseBody = {
  actions: AgentBuilderMCPConfiguration[];
};

async function handler(
  req: NextApiRequest,
  res: NextApiResponse<WithAPIErrorResponse<GetActionsResponseBody>>,
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
    const agentConfiguration = await getAgentConfiguration(auth, {
      agentId: aId,
      variant: "full",
    });
    if (!agentConfiguration) {
      return apiError(req, res, {
        status_code: 404,
        api_error: {
          type: "agent_configuration_not_found",
          message: "Agent configuration not found.",
        },
      });
    }

    const { dataSourceViews, mcpServerViews } =
      await getAccessibleSourcesAndAppsForActions(auth);
    const mcpServerViewsJSON = mcpServerViews.map((v) => v.toJSON());

    const actions = await buildInitialActions({
      dataSourceViews,
      configuration: agentConfiguration,
      mcpServerViews: mcpServerViewsJSON,
    });

    if (
      agentConfiguration.scope !== "visible" &&
      agentConfiguration.scope !== "hidden"
    ) {
      throw new Error("Invalid agent scope");
    }

    res.status(200).json({ actions });
    // eslint-disable-next-line @typescript-eslint/no-unused-vars
  } catch (error) {
    return apiError(req, res, {
      status_code: 500,
      api_error: {
        type: "internal_server_error",
        message: "Failed to fetch builder state.",
      },
    });
  }
}

export default withSessionAuthenticationForWorkspace(handler);
