import type { AuthenticatorType } from "@app/lib/auth";
import type * as activities from "@app/temporal/analytics_queue/activities";
import {
  storeAgentMessageConsumptionAttributionV2Signal,
  storeAgentMessageConsumptionAttributionV3Signal,
} from "@app/temporal/analytics_queue/signals";
import type {
  AgentLoopArgs,
  AgentMessageRef,
} from "@app/types/assistant/agent_run";
import { proxyActivities, setHandler } from "@temporalio/workflow";

const {
  storeAgentAnalyticsActivity,
  storeAgentMessageFeedbackActivity,
  storeAgentMessageConsumptionAttributionActivity,
} = proxyActivities<typeof activities>({
  startToCloseTimeout: "5 minutes",
  retry: {
    // Analytics is best effort, only retry twice.
    maximumAttempts: 2,
    initialInterval: "30 seconds",
    backoffCoefficient: 2,
  },
});

// Consumption indexing is idempotent. The default policy retries without an attempt limit.
const { storeAgentMessageConsumptionAnalyticsActivity } = proxyActivities<
  typeof activities
>({
  startToCloseTimeout: "5 minutes",
});

export async function storeAgentAnalyticsWorkflow(
  authType: AuthenticatorType,
  {
    agentLoopArgs,
  }: {
    agentLoopArgs: AgentLoopArgs;
  }
): Promise<void> {
  await storeAgentAnalyticsActivity(authType, {
    agentLoopArgs,
  });
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

// Kept unchanged for executions started before the V2 signal workflow was deployed.
export async function storeAgentMessageConsumptionAttributionWorkflow(
  authType: AuthenticatorType,
  {
    agentLoopArgs,
  }: {
    agentLoopArgs: AgentLoopArgs;
  }
): Promise<void> {
  await storeAgentMessageConsumptionAttributionActivity(authType, {
    agentLoopArgs,
  });
}

// Durable recompute of one message's consumption breakdown. New launches use this versioned
// workflow, while the original workflow above remains available for replay. A finalize signals this
// on every pass. A signal received while the activity runs requests one more pass, and a signal
// received before it runs is covered by the activity reading the latest message state from the DB.
export async function storeAgentMessageConsumptionAttributionV2Workflow(
  authType: AuthenticatorType,
  {
    agentLoopArgs,
  }: {
    agentLoopArgs: AgentLoopArgs;
  }
): Promise<void> {
  let pendingRecompute = true;

  setHandler(storeAgentMessageConsumptionAttributionV2Signal, () => {
    pendingRecompute = true;
  });

  while (pendingRecompute) {
    pendingRecompute = false;
    await storeAgentMessageConsumptionAttributionActivity(authType, {
      agentLoopArgs,
    });
  }
}

// V3 adds consumption analytics indexation after each committed attribution pass. V2 remains
// unchanged above so executions started before this deployment can replay deterministically.
export async function storeAgentMessageConsumptionAttributionV3Workflow(
  authType: AuthenticatorType,
  {
    agentLoopArgs,
  }: {
    agentLoopArgs: AgentLoopArgs;
  }
): Promise<void> {
  let pendingRecompute = true;

  setHandler(storeAgentMessageConsumptionAttributionV3Signal, () => {
    pendingRecompute = true;
  });

  while (pendingRecompute) {
    pendingRecompute = false;

    await storeAgentMessageConsumptionAttributionActivity(authType, {
      agentLoopArgs,
    });

    await storeAgentMessageConsumptionAnalyticsActivity(authType, {
      agentLoopArgs,
    });
  }
}
