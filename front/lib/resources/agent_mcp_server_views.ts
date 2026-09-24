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
import { removeNulls } from "@app/types/shared/utils/general";
import uniq from "lodash/uniq";
import type { Transaction } from "sequelize";
import { Op } from "sequelize";

// Leaf module (imports only agent models and the agent cache/indexation leaves, never
// `AgentResource`) so the MCP server view, data source view and data source resources — which
// `AgentResource` transitively depends on — can import it without forming a cycle.

/**
 * @cc [owner:tdraier,label:backend;performance] agent-tools-cascade-through-agent-domain
 * A system cascade that removes agent tools because a capability they use goes away (an MCP server
 * view deleted or restricted to skills, a data source view or data source deleted) MUST go through
 * this module, so the tool rows (and their data-source / table / child-agent links), the cache
 * invalidation and the search reindex of every agent whose configurations referenced a removed tool
 * stay owned by the agent domain. Runtime callers MUST NOT destroy `AgentMCPServerConfigurationModel`
 * rows or their data-source / table links directly.
 * The removal applies in place to every configuration version — no new version — and is NOT gated
 * on the agent's `write`/`admin` verbs. Under a transaction, invalidation and reindex run after
 * commit.
 */
async function destroyAgentMCPServerConfigurations(
  auth: Authenticator,
  {
    mcpConfigurations,
    transaction,
  }: {
    mcpConfigurations: Pick<
      AgentMCPServerConfigurationModel,
      "id" | "agentConfigurationId"
    >[];
    transaction?: Transaction;
  }
): Promise<void> {
  if (mcpConfigurations.length === 0) {
    return;
  }

  const owner = auth.getNonNullableWorkspace();
  const workspaceId = owner.id;

  const mcpConfigurationModelIds = uniq(
    mcpConfigurations.map((configuration) => configuration.id)
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

// Removes every agent tool running on one of the given MCP server views.
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
  const mcpConfigurations = await AgentMCPServerConfigurationModel.findAll({
    attributes: ["id", "agentConfigurationId"],
    where: {
      workspaceId: auth.getNonNullableWorkspace().id,
      mcpServerViewId: { [Op.in]: mcpServerViewIds },
    },
    transaction,
  });

  await destroyAgentMCPServerConfigurations(auth, {
    mcpConfigurations,
    transaction,
  });
}

// Removes every agent data-source / table link matching `linkFilter`, and the whole tools that
// carried one.
async function destroyAgentMCPServerConfigurationsForDataSourceLinks(
  auth: Authenticator,
  {
    linkFilter,
    transaction,
  }: {
    linkFilter: { dataSourceViewId: ModelId } | { dataSourceId: ModelId };
    transaction?: Transaction;
  }
): Promise<void> {
  const workspaceId = auth.getNonNullableWorkspace().id;
  const where = { workspaceId, ...linkFilter };

  const dataSourceConfigurations =
    await AgentDataSourceConfigurationModel.findAll({
      attributes: ["mcpServerConfigurationId"],
      where,
      transaction,
    });
  const tablesQueryConfigurations =
    await AgentTablesQueryConfigurationTableModel.findAll({
      attributes: ["mcpServerConfigurationId"],
      where,
      transaction,
    });

  // Links without a tool (legacy rows with a null `mcpServerConfigurationId`) are not reached by
  // the tool cascade below.
  await AgentDataSourceConfigurationModel.destroy({ where, transaction });

  const mcpConfigurationModelIds = uniq(
    removeNulls(
      [...dataSourceConfigurations, ...tablesQueryConfigurations].map(
        (configuration) => configuration.mcpServerConfigurationId
      )
    )
  );
  if (mcpConfigurationModelIds.length === 0) {
    return;
  }

  const mcpConfigurations = await AgentMCPServerConfigurationModel.findAll({
    attributes: ["id", "agentConfigurationId"],
    where: { workspaceId, id: { [Op.in]: mcpConfigurationModelIds } },
    transaction,
  });

  await destroyAgentMCPServerConfigurations(auth, {
    mcpConfigurations,
    transaction,
  });
}

export async function destroyAgentMCPServerConfigurationsForDataSourceView(
  auth: Authenticator,
  {
    dataSourceViewId,
    transaction,
  }: {
    dataSourceViewId: ModelId;
    transaction?: Transaction;
  }
): Promise<void> {
  await destroyAgentMCPServerConfigurationsForDataSourceLinks(auth, {
    linkFilter: { dataSourceViewId },
    transaction,
  });
}

export async function destroyAgentMCPServerConfigurationsForDataSource(
  auth: Authenticator,
  {
    dataSourceId,
    transaction,
  }: {
    dataSourceId: ModelId;
    transaction?: Transaction;
  }
): Promise<void> {
  await destroyAgentMCPServerConfigurationsForDataSourceLinks(auth, {
    linkFilter: { dataSourceId },
    transaction,
  });
}
