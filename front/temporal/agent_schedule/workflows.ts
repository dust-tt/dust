import { proxyActivities } from "@temporalio/workflow";

import type { AuthenticatorType } from "@app/lib/auth";
import type * as activities from "@app/temporal/agent_schedule/activities";
import type { TriggerType } from "@app/types/assistant/triggers";

const { runScheduledAgentsActivity } = proxyActivities<typeof activities>({
  startToCloseTimeout: "5 minutes",
});

export async function agentScheduleWorkflow(
  authType: AuthenticatorType,
  trigger: TriggerType
) {
  await runScheduledAgentsActivity(authType, trigger);
}
