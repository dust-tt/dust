import type * as activities from "@app/temporal/es_indexation/activities";
import {
  continueAsNew,
  proxyActivities,
  setHandler,
  sleep,
  workflowInfo,
} from "@temporalio/workflow";

import { concurrentExecutor } from "../workflow_utils";
import { indexSkillSearchSignal, indexUserSearchSignal } from "./signals";

const DEBOUNCE_DELAY_MS = 1_000;

const {
  deleteWorkspaceSkillSearchActivity,
  indexSkillSearchActivity,
  indexUserSearchActivity,
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

  // /!\ Any signal received outside of the while loop will be lost, so don't make any async call
  // here, which will allow the signal handler to be executed by the nodejs event loop.
}

export async function deleteWorkspaceSkillSearchWorkflow({
  workspaceId,
}: {
  workspaceId: string;
}): Promise<void> {
  await deleteWorkspaceSkillSearchActivity({ workspaceId });
}

const {
  listSearchUsageWorkspacesActivity,
  refreshWorkspaceSearchUsageActivity,
} = proxyActivities<typeof activities>({
  startToCloseTimeout: "10 minutes",
  retry: { maximumAttempts: 3 },
});

export async function refreshSearchUsageWorkflow({
  afterWorkspaceModelId = 0,
  evaluatedAtMs = workflowInfo().startTime.getTime(),
}: {
  afterWorkspaceModelId?: number;
  evaluatedAtMs?: number;
} = {}): Promise<void> {
  const workspaces = await listSearchUsageWorkspacesActivity(
    afterWorkspaceModelId
  );
  await concurrentExecutor(
    workspaces,
    ({ workspaceId }) =>
      refreshWorkspaceSearchUsageActivity({ workspaceId, evaluatedAtMs }),
    { concurrency: 5 }
  );
  if (workspaces.length === 50) {
    await continueAsNew<typeof refreshSearchUsageWorkflow>({
      afterWorkspaceModelId: workspaces[workspaces.length - 1].workspaceModelId,
      evaluatedAtMs,
    });
  }
}

export async function refreshWorkspaceSearchUsageWorkflow({
  workspaceId,
  evaluatedAtMs = workflowInfo().startTime.getTime(),
}: {
  workspaceId: string;
  evaluatedAtMs?: number;
}): Promise<void> {
  await refreshWorkspaceSearchUsageActivity({ workspaceId, evaluatedAtMs });
}
