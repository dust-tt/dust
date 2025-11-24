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

      const mcpConfigurations = await AgentMCPServerConfiguration.findAll({
        where: {
          workspaceId: owner.id,
        },
        attributes: ["sId", "name"],
        include: [
          {
            model: AgentConfiguration,
            where: {
              sId: aId,
              status: {
                [Op.ne]: "draft",
              },
            },
            required: true,
            attributes: [],
          },
        ],
      });

      // Deduplicate configurations by sId
      const seenSIds = new Set<string>();
      const configurations = mcpConfigurations
        .filter((c) => {
          if (seenSIds.has(c.sId)) {
            return false;
          }
          seenSIds.add(c.sId);
          return true;
        })
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
