import { proxyActivities } from "@temporalio/workflow";

import type { ContentFragmentInputWithFileIdType } from "@app/types";
import type { TriggerType } from "@app/types/assistant/triggers";

import type * as activities from "./activities";

const { runTriggeredAgentsActivity } = proxyActivities<typeof activities>({
  startToCloseTimeout: "5 minutes",
  retry: {
    nonRetryableErrorTypes: ["TriggerNonRetryableError"],
  },
});

export async function agentTriggerWorkflow(
  userId: string,
  workspaceId: string,
  trigger: TriggerType,
  contentFragment?: ContentFragmentInputWithFileIdType
) {
  await runTriggeredAgentsActivity({
    userId,
    workspaceId,
    trigger,
    contentFragment,
  });
}
