import { Op, Sequelize } from "sequelize";

import { remoteMCPServerNameToSId } from "@app/lib/actions/mcp_helper";
import type { Authenticator } from "@app/lib/auth";
import { AgentMCPServerConfiguration } from "@app/lib/models/assistant/actions/mcp";
import { MCPServerViewModel } from "@app/lib/models/assistant/actions/mcp_server_view";
import { AgentConfiguration } from "@app/lib/models/assistant/agent";
import { GroupResource } from "@app/lib/resources/group_resource";
import type { AgentsUsageType, ModelId } from "@app/types";

// To use in case of heavy db load emergency with these usages queries
// If it is a problem, let's add caching
const DISABLE_QUERIES = false;

export type MCPServersUsageByAgent = Record<string, AgentsUsageType>;

export async function getToolsUsage(
  auth: Authenticator
): Promise<MCPServersUsageByAgent> {
  const owner = auth.workspace();

  // This condition is critical it checks that we can identify the workspace and that the current
  // auth is a user for this workspace. Checking `auth.isUser()` is critical as it would otherwise
  // be possible to access data sources without being authenticated.
  if (!owner || !auth.isUser()) {
    return {};
  }

  if (DISABLE_QUERIES) {
    return {};
  }

  const getAgentsForUser = async () =>
    (
      await GroupResource.findAgentIdsForGroups(
        auth,
        auth
          .groups()
          .filter((g) => g.kind === "agent_editors")
          .map((g) => g.id)
      )
    ).map((g) => g.agentConfigurationId);

  const getAgentWhereClauseAdmin = () => ({
    status: "active",
    workspaceId: owner.id,
  });

  const getAgentWhereClauseNonAdmin = async () => ({
    status: "active",
    workspaceId: owner.id,
    // If user is non-admin, only include agents that either they have access to or are published.
    [Op.or]: [
      {
        scope: "visible",
      },
      {
        id: {
          [Op.in]: await getAgentsForUser(),
        },
      },
    ],
  });

  const res = (await AgentConfiguration.findAll({
    raw: true,
    group: [
      "mcpServerConfigurations->mcpServerView.internalMCPServerId",
      "mcpServerConfigurations->mcpServerView.remoteMCPServerId",
    ],
    where: auth.isAdmin()
      ? getAgentWhereClauseAdmin()
      : await getAgentWhereClauseNonAdmin(),
    attributes: [
      "mcpServerConfigurations->mcpServerView.internalMCPServerId",
      "mcpServerConfigurations->mcpServerView.remoteMCPServerId",
      [
        Sequelize.fn(
          "array_agg",
          Sequelize.literal(
            '"agent_configuration"."name" ORDER BY "agent_configuration"."name"'
          )
        ),
        "names",
      ],
      [
        Sequelize.fn(
          "array_agg",
          Sequelize.literal(
            '"agent_configuration"."sId" ORDER BY "agent_configuration"."name"'
          )
        ),
        "sIds",
      ],
    ],
    include: [
      {
        model: AgentMCPServerConfiguration,
        as: "mcpServerConfigurations",
        attributes: [],
        required: true,
        include: [
          {
            model: MCPServerViewModel,
            as: "mcpServerView",
            attributes: [],
            required: true,
          },
        ],
      },
    ],
  })) as unknown as {
    internalMCPServerId: string;
    remoteMCPServerId: ModelId;
    names: string[];
    sIds: string[];
  }[];

  return res.reduce<MCPServersUsageByAgent>((acc, mcpServerViewConfig) => {
    acc[
      mcpServerViewConfig.internalMCPServerId ||
        remoteMCPServerNameToSId({
          remoteMCPServerId: mcpServerViewConfig.remoteMCPServerId,
          workspaceId: owner.id,
        })
    ] = {
      count: mcpServerViewConfig.sIds.length,
      agents: mcpServerViewConfig.sIds.map((sId, index) => ({
        sId,
        name: mcpServerViewConfig.names[index],
      })),
    };
    return acc;
  }, {});
}
