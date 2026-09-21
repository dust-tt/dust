import { concurrentExecutor } from "@app/lib/utils/async_utils";
import logger from "@app/logger/logger";
import { launchIndexAgentSearchWorkflow } from "@app/temporal/es_indexation/client";
import uniq from "lodash/uniq";
import type { Transaction } from "sequelize";

const AGENT_SEARCH_INDEXATION_CONCURRENCY = 8;

// Standalone so write paths can enqueue without importing `AgentResource` (which transitively
// imports them via `SkillResource` — a cycle), as `agent_resource_cache` does for invalidation.
// TODO(2026-09-21 sfriquet): drop this module once every caller goes through `AgentResource`.
/**
 * @cc [owner:sfriquet,label:backend;concurrency] agent-search-after-commit
 * Agent mutations enqueue workspace-scoped agent sIds after their existing writes. Under a
 * transaction the whole batch runs in a single after-commit hook.
 * Failed workflow launch results are logged without failing the mutation.
 */
export async function launchAgentSearchIndexation(
  workspaceId: string,
  agentIds: string[],
  transaction?: Transaction
): Promise<void> {
  if (agentIds.length === 0) {
    return;
  }

  const indexAll = async () => {
    const results = await concurrentExecutor(
      uniq(agentIds),
      (agentId) => launchIndexAgentSearchWorkflow({ workspaceId, agentId }),
      { concurrency: AGENT_SEARCH_INDEXATION_CONCURRENCY }
    );
    const failedResult = results.find((result) => result.isErr());
    if (failedResult?.isErr()) {
      logger.error(
        { error: failedResult.error, workspaceId, agentIds },
        "Failed to launch agent search indexation"
      );
    }
  };

  if (transaction) {
    transaction.afterCommit(indexAll);
    return;
  }
  await indexAll();
}
