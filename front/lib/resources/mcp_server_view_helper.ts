import type { Authenticator } from "@app/lib/auth";
import { ConversationMCPServerViewModel } from "@app/lib/models/agent/actions/conversation_mcp_server_view";
import { AgentDataSourceConfigurationModel } from "@app/lib/models/agent/actions/data_sources";
import {
  AgentChildAgentConfigurationModel,
  AgentMCPServerConfigurationModel,
} from "@app/lib/models/agent/actions/mcp";
import { AgentProjectConfigurationModel } from "@app/lib/models/agent/actions/projects";
import { AgentTablesQueryConfigurationTableModel } from "@app/lib/models/agent/actions/tables_query";
import { AgentConfigurationModel } from "@app/lib/models/agent/agent";
import { SkillMCPServerConfigurationModel } from "@app/lib/models/skill";
import { AgentSearchIndexationResource } from "@app/lib/resources/agent/agent_search_indexation_resource";
import { SandboxFunctionMCPActionResource } from "@app/lib/resources/sandbox_function_mcp_action_resource";
import { makeSId } from "@app/lib/resources/string_ids";
import { launchSkillsSearchIndexation } from "@app/lib/skill_search/indexation";
import {
  runAfterTransactionCommit,
  withTransaction,
} from "@app/lib/utils/sql_utils";
import type { ModelId } from "@app/types/shared/model_id";
import type { Transaction } from "sequelize";

/**
 * @cc [owner:aubin-tchoi,label:backend;concurrency] committed-view-dependency-removal
 * View dependencies are removed atomically within the caller's workspace; affected skill and
 * agent search documents and external output deletion wait for the outer transaction to commit.
 */
export async function destroyMCPServerViewDependencies(
  auth: Authenticator,
  {
    mcpServerViewIds,
    transaction,
  }: {
    mcpServerViewIds: ModelId[];
    transaction?: Transaction;
  }
): Promise<void> {
  const workspace = auth.getNonNullableWorkspace();
  const skillIds = await withTransaction(
    async (t) => {
      await destroyAgentMCPServerConfigurationsForViews(auth, {
        mcpServerViewIds,
        transaction: t,
      });
      const skillConfigurations =
        await SkillMCPServerConfigurationModel.findAll({
          attributes: ["skillConfigurationId"],
          where: {
            workspaceId: workspace.id,
            mcpServerViewId: mcpServerViewIds,
          },
          transaction: t,
        });
      await ConversationMCPServerViewModel.destroy({
        where: { workspaceId: workspace.id, mcpServerViewId: mcpServerViewIds },
        transaction: t,
      });
      await SkillMCPServerConfigurationModel.destroy({
        where: { workspaceId: workspace.id, mcpServerViewId: mcpServerViewIds },
        transaction: t,
      });
      // Rows FK the view with RESTRICT; output files are removed only after the outer commit.
      await SandboxFunctionMCPActionResource.deleteAllForMCPServerViews(auth, {
        mcpServerViewIds,
        transaction: t,
      });
      return [
        ...new Set(
          skillConfigurations.map((config) =>
            makeSId("skill", {
              id: config.skillConfigurationId,
              workspaceId: workspace.id,
            })
          )
        ),
      ];
    },
    transaction,
    { useSavepoint: true }
  );
  await runAfterTransactionCommit(transaction, () =>
    launchSkillsSearchIndexation({ workspaceId: workspace.sId, skillIds })
  );
}

/**
 * @cc [owner:aubin-tchoi,label:backend;concurrency] committed-view-agent-tool-removal
 * Agent tool removal deletes all child configurations, including pod attachments, atomically;
 * only affected logical agents in the caller's workspace are reindexed after the outer commit.
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
  const workspace = auth.getNonNullableWorkspace();
  const agentIds = await withTransaction(
    async (t) => {
      const configurations = await AgentMCPServerConfigurationModel.findAll({
        attributes: ["id", "agentConfigurationId"],
        where: { workspaceId: workspace.id, mcpServerViewId: mcpServerViewIds },
        transaction: t,
      });
      if (configurations.length === 0) {
        return [];
      }
      const agents = await AgentConfigurationModel.findAll({
        attributes: ["sId"],
        where: {
          workspaceId: workspace.id,
          id: [
            ...new Set(
              configurations.map((config) => config.agentConfigurationId)
            ),
          ],
        },
        transaction: t,
      });
      const ids = configurations.map((config) => config.id);
      const options = {
        where: { workspaceId: workspace.id, mcpServerConfigurationId: ids },
        transaction: t,
      };
      await AgentDataSourceConfigurationModel.destroy(options);
      await AgentTablesQueryConfigurationTableModel.destroy(options);
      await AgentChildAgentConfigurationModel.destroy(options);
      await AgentProjectConfigurationModel.destroy(options);
      await AgentMCPServerConfigurationModel.destroy({
        where: { workspaceId: workspace.id, id: ids },
        transaction: t,
      });
      return [...new Set(agents.map((agent) => agent.sId))];
    },
    transaction,
    { useSavepoint: true }
  );
  await AgentSearchIndexationResource.launch(
    { workspaceId: workspace.sId, agentIds },
    { transaction }
  );
}
