import { concurrentExecutor } from "@app/lib/utils/async_utils";
import {
  launchDeleteWorkspaceSkillSearchWorkflow,
  launchIndexSkillSearchWorkflow,
} from "@app/temporal/es_indexation/client";

const SKILL_SEARCH_INDEXATION_CONCURRENCY = 8;

export async function launchSkillSearchIndexation({
  workspaceId,
  skillId,
}: {
  workspaceId: string;
  skillId: string;
}): Promise<void> {
  const result = await launchIndexSkillSearchWorkflow({ workspaceId, skillId });
  if (result.isErr()) {
    throw result.error;
  }
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
