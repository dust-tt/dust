import { Op } from "sequelize";

import { AgentMCPServerConfiguration } from "@app/lib/models/agent/actions/mcp";
import { AgentConfiguration } from "@app/lib/models/agent/agent";

export type AgentMcpConfigurationSummary = {
  sId: string;
  name: string | null;
};

export async function listAgentMcpConfigurationsForAgent(params: {
  workspaceId: number;
  agentConfigurationSId: string;
}): Promise<AgentMcpConfigurationSummary[]> {
  const { workspaceId, agentConfigurationSId } = params;

  const mcpConfigurations = await AgentMCPServerConfiguration.findAll({
    where: {
      workspaceId,
    },
    attributes: ["sId", "name"],
    include: [
      {
        model: AgentConfiguration,
        where: {
          sId: agentConfigurationSId,
          status: {
            [Op.ne]: "draft",
          },
        },
        required: true,
        attributes: [],
      },
    ],
  });

  const seenSIds = new Set<string>();

  return mcpConfigurations
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
}
