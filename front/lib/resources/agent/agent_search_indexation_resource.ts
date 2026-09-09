import {
  launchAgentsSearchIndexation,
  launchWorkspaceAgentSearchDeletion,
} from "@app/lib/agent_search/indexation";
import { WorkspaceModel } from "@app/lib/resources/storage/models/workspace";
import { runAfterTransactionCommit } from "@app/lib/utils/sql_utils";
import { isGlobalAgentId } from "@app/types/assistant/assistant";
import type { ModelId } from "@app/types/shared/model_id";
import type { Transaction } from "sequelize";

// Kept independent of AgentResource so tag, skill and feedback writers can use the same entrypoint.
export class AgentSearchIndexationResource {
  static async deleteWorkspace(
    workspaceId: string,
    { transaction }: { transaction?: Transaction } = {}
  ): Promise<void> {
    await runAfterTransactionCommit(transaction, () =>
      launchWorkspaceAgentSearchDeletion({ workspaceId })
    );
  }

  /**
   * @cc [owner:aubin-tchoi,label:backend;concurrency] committed-agent-search-invalidation
   * Enqueue deduplicated workspace-owned logical agent IDs only after the caller's outer
   * transaction commits; code-defined global agents never produce workspace index documents.
   */
  static async launch(
    {
      workspaceId,
      agentIds,
    }: { workspaceId: string; agentIds: readonly string[] },
    { transaction }: { transaction?: Transaction } = {}
  ): Promise<void> {
    const customAgentIds = [...new Set(agentIds)].filter(
      (id) => !isGlobalAgentId(id)
    );
    if (customAgentIds.length === 0) {
      return;
    }
    await runAfterTransactionCommit(transaction, () =>
      launchAgentsSearchIndexation({ workspaceId, agentIds: customAgentIds })
    );
  }

  static async launchForWorkspaceModelId(
    {
      workspaceModelId,
      agentIds,
    }: { workspaceModelId: ModelId; agentIds: readonly string[] },
    { transaction }: { transaction?: Transaction } = {}
  ): Promise<void> {
    if (!agentIds.some((id) => !isGlobalAgentId(id))) {
      return;
    }
    const workspace = await WorkspaceModel.findByPk(workspaceModelId, {
      attributes: ["sId"],
      transaction,
    });
    // Workspace scrubbing can remove the owner before a cascading relation cleanup.
    if (workspace) {
      await this.launch(
        { workspaceId: workspace.sId, agentIds },
        { transaction }
      );
    }
  }
}
