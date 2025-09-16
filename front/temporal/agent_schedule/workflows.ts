import { proxyActivities } from "@temporalio/workflow";

import type * as activities from "@app/temporal/agent_schedule/activities";
import type { ContentFragmentInputWithFileIdType } from "@app/types";
import type { TriggerType } from "@app/types/assistant/triggers";

const { runTriggeredAgentsActivity } = proxyActivities<typeof activities>({
  startToCloseTimeout: "5 minutes",
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
