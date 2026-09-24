import type { Authenticator } from "@app/lib/auth";
import { AgentDataSourceConfigurationModel } from "@app/lib/models/agent/actions/data_sources";
import {
  AgentChildAgentConfigurationModel,
  AgentMCPServerConfigurationModel,
} from "@app/lib/models/agent/actions/mcp";
import { AgentTablesQueryConfigurationTableModel } from "@app/lib/models/agent/actions/tables_query";
import { AgentConfigurationModel } from "@app/lib/models/agent/agent";
import { invalidateAgentResourceCaches } from "@app/lib/resources/agent_resource_cache";
import { launchAgentSearchIndexation } from "@app/lib/resources/agent_resource_indexation";
import type { ModelId } from "@app/types/shared/model_id";
import uniq from "lodash/uniq";
import type { Transaction } from "sequelize";
import { Op } from "sequelize";

// Leaf module (imports only agent models and the agent cache/indexation leaves, never
// `AgentResource`) so the MCP server view resources — which `AgentResource` transitively depends on —
// can import it without forming a cycle.

/**
 * @cc [owner:tdraier,label:backend;performance] agent-tools-cascade-through-agent-domain
 * A system cascade that removes agent tools because their MCP server views are deleted or restricted
 * to skills MUST go through this function, so the tool rows (and their data-source / table /
 * child-agent links), the cache invalidation and the search reindex of every agent whose
 * configurations referenced one of the views stay owned by the agent domain. Runtime callers MUST NOT
 * destroy `AgentMCPServerConfigurationModel` rows by view directly. The removal applies in place to
 * every configuration version — no new version — and is NOT gated on the agent's `write`/`admin`
 * verbs. Under a transaction, invalidation and reindex run after commit.
 */
export async function destroyAgentMCPServerConfigurationsForViews(
  auth: Authenticator,
  {
    mcpServerViewIds,
    transaction,
  }: {
    mcpServerViewIds: ModelId[];
    transaction?: Transaction;
  }
): Promise<void> {
  const owner = auth.getNonNullableWorkspace();
  const workspaceId = owner.id;

  const mcpConfigurations = await AgentMCPServerConfigurationModel.findAll({
    attributes: ["id", "agentConfigurationId"],
    where: {
      workspaceId,
      mcpServerViewId: { [Op.in]: mcpServerViewIds },
    },
    transaction,
  });
  if (mcpConfigurations.length === 0) {
    return;
  }

  const mcpConfigurationModelIds = mcpConfigurations.map(
    (configuration) => configuration.id
  );

  const agentConfigurations = await AgentConfigurationModel.findAll({
    attributes: ["sId"],
    where: {
      workspaceId,
      id: {
        [Op.in]: uniq(
          mcpConfigurations.map(
            (configuration) => configuration.agentConfigurationId
          )
        ),
      },
    },
    transaction,
  });
  const agentIds = uniq(
    agentConfigurations.map((configuration) => configuration.sId)
  );

  await AgentDataSourceConfigurationModel.destroy({
    where: {
      workspaceId,
      mcpServerConfigurationId: { [Op.in]: mcpConfigurationModelIds },
    },
    transaction,
  });

  await AgentTablesQueryConfigurationTableModel.destroy({
    where: {
      workspaceId,
      mcpServerConfigurationId: { [Op.in]: mcpConfigurationModelIds },
    },
    transaction,
  });

  await AgentChildAgentConfigurationModel.destroy({
    where: {
      workspaceId,
      mcpServerConfigurationId: { [Op.in]: mcpConfigurationModelIds },
    },
    transaction,
  });

  await AgentMCPServerConfigurationModel.destroy({
    where: {
      workspaceId,
      id: { [Op.in]: mcpConfigurationModelIds },
    },
    transaction,
  });

  await invalidateAgentResourceCaches(workspaceId, agentIds, transaction);

  // `mcp_server_view_ids` is indexed, so the search documents of the affected agents are now stale.
  await launchAgentSearchIndexation(owner.sId, agentIds, transaction);
}
