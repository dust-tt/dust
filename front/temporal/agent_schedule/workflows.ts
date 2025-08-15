import { proxyActivities } from "@temporalio/workflow";
import type * as activities from "@app/temporal/agent_schedule/activities";
import { AuthenticatorType } from "@app/lib/auth";
import { LightTriggerType } from "@app/types/assistant/triggers";

const { runScheduledAgentsActivity } = proxyActivities<typeof activities>({
  startToCloseTimeout: "2 minutes",
});

export async function agentScheduleWorkflow(
  authType: AuthenticatorType,
  agentConfigurationId: string,
  trigger: LightTriggerType
) {
  await runScheduledAgentsActivity(authType, agentConfigurationId, trigger);
}
