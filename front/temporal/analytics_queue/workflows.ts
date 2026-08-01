import type { AuthenticatorType } from "@app/lib/auth";
import type * as activities from "@app/temporal/analytics_queue/activities";
import { storeAgentMessageConsumptionAttributionSignal } from "@app/temporal/analytics_queue/signals";
import type {
  AgentLoopArgs,
  AgentMessageRef,
} from "@app/types/assistant/agent_run";
import { proxyActivities, setHandler, sleep } from "@temporalio/workflow";

// Coalesce the finalize burst (a message settles across several passes: pause for approval, resume,
// Temporal retries) into few recompute runs. Short because attribution is off the hot path.
const CONSUMPTION_ATTRIBUTION_DEBOUNCE_MS = 15 * 1000;

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

// Durable, coalesced recompute of one message's consumption breakdown. A finalize signals this
// workflow on every pass through signalWithStart in the client. A pass arriving while a recompute is
// in flight sets the flag again and the loop runs once more, so a tool approved during that window
// is still reflected rather than dropped as an already-started start. The activity reads the whole
// message from the database, so it needs no per-pass arguments beyond the stable agent message and
// conversation ids carried by the first start.
export async function storeAgentMessageConsumptionAttributionWorkflow(
  authType: AuthenticatorType,
  {
    agentLoopArgs,
  }: {
    agentLoopArgs: AgentLoopArgs;
  }
): Promise<void> {
  let pendingRecompute = true;

  setHandler(storeAgentMessageConsumptionAttributionSignal, () => {
    pendingRecompute = true;
  });

  while (pendingRecompute) {
    await sleep(CONSUMPTION_ATTRIBUTION_DEBOUNCE_MS);
    pendingRecompute = false;
    await storeAgentMessageConsumptionAttributionActivity(authType, {
      agentLoopArgs,
    });
  }
}
