import { proxyActivities } from "@temporalio/workflow";

import type * as activities from "@app/temporal/agent_schedule/activities";
import type { TriggerType } from "@app/types/assistant/triggers";

const { runScheduledAgentsActivity } = proxyActivities<typeof activities>({
  startToCloseTimeout: "5 minutes",
});

export async function agentScheduleWorkflow(
  userId: string,
  workspaceId: string,
  trigger: TriggerType
) {
  await runScheduledAgentsActivity(userId, workspaceId, trigger);
}
