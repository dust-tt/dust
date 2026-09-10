import { concurrentExecutor } from "@app/lib/utils/async_utils";
import {
  launchDeleteWorkspaceSkillSearchWorkflow,
  launchIndexSkillSearchWorkflow,
} from "@app/temporal/es_indexation/client";
import type { Transaction } from "sequelize";

const SKILL_SEARCH_INDEXATION_CONCURRENCY = 8;

/**
 * @cc [owner:aubin-tchoi,label:backend;concurrency] skill-indexation-after-commit
 * An explicit transaction defers skill indexing until it and its ancestors commit;
 * rolling back any enclosing transaction suppresses the effect.
 */
export async function runAfterSkillSearchCommit(
  transaction: Transaction | undefined,
  effect: () => Promise<void>
): Promise<void> {
  if (!transaction) {
    await effect();
    return;
  }
  transaction.afterCommit(() =>
    runAfterSkillSearchCommit(transaction.parent, effect)
  );
}

export async function launchSkillsSearchIndexation({
  workspaceId,
  skillIds,
}: {
  workspaceId: string;
  skillIds: readonly string[];
}): Promise<void> {
  const results = await concurrentExecutor(
    skillIds,
    (skillId) => launchIndexSkillSearchWorkflow({ workspaceId, skillId }),
    { concurrency: SKILL_SEARCH_INDEXATION_CONCURRENCY }
  );
  const failedResult = results.find((result) => result.isErr());
  if (failedResult?.isErr()) {
    throw failedResult.error;
  }
}

export async function launchWorkspaceSkillSearchDeletion({
  workspaceId,
}: {
  workspaceId: string;
}): Promise<void> {
  const result = await launchDeleteWorkspaceSkillSearchWorkflow({
    workspaceId,
  });
  if (result.isErr()) {
    throw result.error;
  }
}
