import { proxyActivities } from "@temporalio/workflow";

import type { ContentFragmentInputWithFileIdType } from "@app/types";

import type * as activities from "./activities";

const { runTriggeredAgentsActivity } = proxyActivities<typeof activities>({
  startToCloseTimeout: "5 minutes",
  retry: {
    nonRetryableErrorTypes: ["TriggerNonRetryableError"],
  },
});

export async function agentTriggerWorkflow({
  userId,
  workspaceId,
  triggerId,
  contentFragment,
  webhookRequestId,
}: {
  userId: string;
  workspaceId: string;
  triggerId: string;
  contentFragment?: ContentFragmentInputWithFileIdType;
  webhookRequestId?: number;
}) {
  await runTriggeredAgentsActivity({
    userId,
    workspaceId,
    triggerId,
    contentFragment,
    webhookRequestId,
  });
}
