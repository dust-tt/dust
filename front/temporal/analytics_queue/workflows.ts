import type { AuthenticatorType } from "@app/lib/auth";
import type * as activities from "@app/temporal/analytics_queue/activities";
import type {
  AgentLoopArgs,
  AgentMessageRef,
} from "@app/types/assistant/agent_run";
import { proxyActivities } from "@temporalio/workflow";

const { storeAgentAnalyticsActivity, storeAgentMessageFeedbackActivity } =
  proxyActivities<typeof activities>({
    startToCloseTimeout: "5 minutes",
    retry: {
      // These background projections are best effort and retry twice.
      maximumAttempts: 2,
      initialInterval: "30 seconds",
      backoffCoefficient: 2,
    },
  });

const { materializeAgentMessageConsumptionAttributionActivity } =
  proxyActivities<typeof activities>({
    startToCloseTimeout: "5 minutes",
    retry: {
      maximumAttempts: 10,
      initialInterval: "30 seconds",
      maximumInterval: "30 minutes",
      backoffCoefficient: 2,
    },
  });

export async function storeAgentAnalyticsWorkflow(
  authType: AuthenticatorType,
  {
    agentLoopArgs,
  }: {
    agentLoopArgs: AgentLoopArgs;
  }
): Promise<void> {
  const attributionPromise =
    materializeAgentMessageConsumptionAttributionActivity(authType, {
      agentMessageId: agentLoopArgs.agentMessageId,
      evidence: agentLoopArgs.consumptionAttributionEvidence,
      directToolCreditAmounts: agentLoopArgs.directToolCreditAmounts,
      messageStatus: agentLoopArgs.consumptionAttributionMessageStatus,
    }).catch(() => undefined);
  await Promise.all([
    storeAgentAnalyticsActivity(authType, { agentLoopArgs }),
    attributionPromise,
  ]);
}

export async function storeAgentMessageFeedbackWorkflow(
  authType: AuthenticatorType,
  {
    message,
  }: {
    message: AgentMessageRef;
  }
): Promise<void> {
  await storeAgentMessageFeedbackActivity(authType, {
    message,
  });
}
