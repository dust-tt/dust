import type * as activities from "@app/temporal/reinforced_agent/activities";
import { proxyActivities, setHandler } from "@temporalio/workflow";

import { runSignal } from "./signals";

const { getWorkspacesActivity } = proxyActivities<typeof activities>({
  startToCloseTimeout: "5 minutes",
});

const { analyzeRecentConversationsActivity } = proxyActivities<
  typeof activities
>({
  startToCloseTimeout: "30 minutes",
  heartbeatTimeout: "5 minutes",
});

const { aggregateSyntheticSuggestionsActivity } = proxyActivities<
  typeof activities
>({
  startToCloseTimeout: "15 minutes",
  heartbeatTimeout: "5 minutes",
});

export async function reinforcedAgentWorkflow(): Promise<void> {
  setHandler(runSignal, () => {
    // Empty handler — receiving the signal triggers a workflow execution.
  });

  const workspaceIds = await getWorkspacesActivity();

  // Phase 1: Analyze recent conversations for each workspace.
  for (const workspaceId of workspaceIds) {
    await analyzeRecentConversationsActivity({ workspaceId });
  }

  // Phase 2: Aggregate synthetic suggestions into pending for each workspace.
  for (const workspaceId of workspaceIds) {
    await aggregateSyntheticSuggestionsActivity({ workspaceId });
  }
}
