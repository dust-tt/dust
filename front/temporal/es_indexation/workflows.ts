import type * as activities from "@app/temporal/es_indexation/activities";
import { proxyActivities, setHandler, sleep } from "@temporalio/workflow";

import {
  indexAgentSearchSignal,
  indexSkillSearchSignal,
  indexUserSearchSignal,
} from "./signals";

const DEBOUNCE_DELAY_MS = 1_000;

const {
  deleteAgentSearchActivity,
  deleteSkillSearchActivity,
  deleteWorkspaceAgentSearchActivity,
  deleteWorkspaceSkillSearchActivity,
  indexAgentSearchActivity,
  indexSkillSearchActivity,
  indexUserSearchActivity,
  reindexCodeDefinedSkillsActivity,
  reindexGlobalAgentsActivity,
} = proxyActivities<typeof activities>({
  startToCloseTimeout: "5 minutes",
});

export async function indexUserSearchWorkflow({
  userId,
}: {
  userId: string;
}): Promise<void> {
  let signaled = false;

  setHandler(indexUserSearchSignal, async () => {
    signaled = true;
  });

  while (signaled) {
    signaled = false;
    await sleep(DEBOUNCE_DELAY_MS);
    if (signaled) {
      continue;
    }

    await indexUserSearchActivity({ userId });
  }

  // /!\ Any signal received outside of the while loop will be lost, so don't make any async call
  // here, which will allow the signal handler to be executed by the nodejs event loop.
}

export async function indexSkillSearchWorkflow({
  workspaceId,
  skillId,
}: {
  workspaceId: string;
  skillId: string;
}): Promise<void> {
  let signaled = false;

  setHandler(indexSkillSearchSignal, async () => {
    signaled = true;
  });

  while (signaled) {
    signaled = false;
    await sleep(DEBOUNCE_DELAY_MS);
    if (signaled) {
      continue;
    }

    await indexSkillSearchActivity({ workspaceId, skillId });
  }
}

export async function deleteSkillSearchWorkflow({
  workspaceId,
  skillId,
}: {
  workspaceId: string;
  skillId: string;
}): Promise<void> {
  await deleteSkillSearchActivity({ workspaceId, skillId });
}

export async function deleteWorkspaceSkillSearchWorkflow({
  workspaceId,
}: {
  workspaceId: string;
}): Promise<void> {
  await deleteWorkspaceSkillSearchActivity({ workspaceId });
}

export async function indexAgentSearchWorkflow({
  workspaceId,
  agentId,
}: {
  workspaceId: string;
  agentId: string;
}): Promise<void> {
  let signaled = false;

  setHandler(indexAgentSearchSignal, async () => {
    signaled = true;
  });

  while (signaled) {
    signaled = false;
    await sleep(DEBOUNCE_DELAY_MS);
    if (signaled) {
      continue;
    }

    await indexAgentSearchActivity({ workspaceId, agentId });
  }
}

export async function deleteAgentSearchWorkflow({
  workspaceId,
  agentId,
}: {
  workspaceId: string;
  agentId: string;
}): Promise<void> {
  await deleteAgentSearchActivity({ workspaceId, agentId });
}

export async function deleteWorkspaceAgentSearchWorkflow({
  workspaceId,
}: {
  workspaceId: string;
}): Promise<void> {
  await deleteWorkspaceAgentSearchActivity({ workspaceId });
}

/**
 * @cc [owner:sfriquet,label:product] code-defined-search-coverage
 * Every run MUST reindex both code-defined skills and default global agents. Any reindexing
 * failure MUST be thrown so Temporal retries.
 */
export async function reindexCodeDefinedSearchWorkflow(): Promise<void> {
  await reindexCodeDefinedSkillsActivity();
  await reindexGlobalAgentsActivity();
}

const { listWorkspaceIdsActivity, refreshWorkspaceSearchUsageActivity } =
  proxyActivities<typeof activities>({
    startToCloseTimeout: "10 minutes",
  });

export async function refreshSearchUsageWorkflow(): Promise<void> {
  const workspaceIds = await listWorkspaceIdsActivity();
  for (const workspaceId of workspaceIds) {
    await refreshWorkspaceSearchUsageActivity({ workspaceId });
  }
}

export async function refreshWorkspaceSearchUsageWorkflow({
  workspaceId,
}: {
  workspaceId: string;
}): Promise<void> {
  await refreshWorkspaceSearchUsageActivity({ workspaceId });
}
