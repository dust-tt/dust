import { defineSignal } from "@temporalio/workflow";

// Signals a running consumption-attribution workflow that the message settled further (a tool was
// approved, a retry landed) and its breakdown must be recomputed. A finalize fires this on every
// pass, including while the loop is paused for approval, so a run in flight when a later pass arrives
// reruns rather than dropping it.
export const storeAgentMessageConsumptionAttributionSignal = defineSignal<
  [void]
>("store_agent_message_consumption_attribution_signal");
