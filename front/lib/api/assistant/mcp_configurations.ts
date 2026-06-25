import { AgentMCPServerConfigurationModel } from "@app/lib/models/agent/actions/mcp";
import { AgentConfigurationModel } from "@app/lib/models/agent/agent";
import type { AgentMcpConfigurationSummary } from "@app/types/api/assistant/mcp_configurations";
import { Op } from "sequelize";

export async function listAgentMcpConfigurationsForAgent(params: {
  workspaceId: number;
  agentConfigurationId: string;
}): Promise<AgentMcpConfigurationSummary[]> {
  const { workspaceId, agentConfigurationId } = params;

  const mcpConfigurations = await AgentMCPServerConfigurationModel.findAll({
    where: {
      workspaceId,
    },
    attributes: ["sId", "name"],
    include: [
      {
        model: AgentConfigurationModel,
        where: {
          sId: agentConfigurationId,
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
