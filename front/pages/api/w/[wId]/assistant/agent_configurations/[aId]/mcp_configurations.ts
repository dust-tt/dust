import type { NextApiRequest, NextApiResponse } from "next";
import { Op } from "sequelize";

import { getAgentConfiguration } from "@app/lib/api/assistant/configuration/agent";
import { withSessionAuthenticationForWorkspace } from "@app/lib/api/auth_wrappers";
import type { Authenticator } from "@app/lib/auth";
import { AgentMCPServerConfiguration } from "@app/lib/models/assistant/actions/mcp";
import { AgentConfiguration } from "@app/lib/models/assistant/agent";
import { apiError } from "@app/logger/withlogging";
import type { WithAPIErrorResponse } from "@app/types";

export type GetAgentMcpConfigurationsResponseBody = {
  configurations: Array<{
    sId: string;
    name: string | null;
  }>;
};

async function handler(
  req: NextApiRequest,
  res: NextApiResponse<
    WithAPIErrorResponse<GetAgentMcpConfigurationsResponseBody | void>
  >,
  auth: Authenticator
): Promise<void> {
  const { aId } = req.query;
  if (typeof aId !== "string") {
    return apiError(req, res, {
      status_code: 400,
      api_error: {
        type: "invalid_request_error",
        message: "Invalid agent ID provided.",
      },
    });
  }

  const assistant = await getAgentConfiguration(auth, {
    agentId: aId,
    variant: "light",
  });
  if (!assistant || (!assistant.canRead && !auth.isAdmin())) {
    return apiError(req, res, {
      status_code: 404,
      api_error: {
        type: "agent_configuration_not_found",
        message: "The agent you're trying to access was not found.",
      },
    });
  }

  switch (req.method) {
    case "GET": {
      const owner = auth.workspace();
      if (!owner) {
        return apiError(req, res, {
          status_code: 404,
          api_error: {
            type: "workspace_not_found",
            message: "Workspace not found.",
          },
        });
      }

      const agentVersions = await AgentConfiguration.findAll({
        where: {
          workspaceId: owner.id,
          sId: aId,
          status: {
            [Op.ne]: "draft",
          },
        },
        attributes: ["id"],
      });

      const agentConfigurationIds = agentVersions.map((a) => a.id);

      if (agentConfigurationIds.length === 0) {
        return res.status(200).json({ configurations: [] });
      }

      const mcpConfigurations = await AgentMCPServerConfiguration.findAll({
        where: {
          workspaceId: owner.id,
          agentConfigurationId: agentConfigurationIds,
        },
        attributes: ["sId", "name"],
      });

      const configurations = mcpConfigurations
        .filter((c) => c.sId && c.sId.trim() !== "")
        .map((c) => ({
          sId: c.sId,
          name: c.name,
        }));

      return res.status(200).json({ configurations });
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
