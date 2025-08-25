import { proxyActivities } from "@temporalio/workflow";
import type * as activities from "@app/temporal/agent_schedule/activities";
import { AuthenticatorType } from "@app/lib/auth";
import { TriggerType } from "@app/types/assistant/triggers";

const { runScheduledAgentsActivity } = proxyActivities<typeof activities>({
  startToCloseTimeout: "2 minutes",
});

export async function agentScheduleWorkflow(
  authType: AuthenticatorType,
  trigger: TriggerType
) {
  await runScheduledAgentsActivity(authType, trigger);
}
