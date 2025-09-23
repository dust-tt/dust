import { defineSignal } from "@temporalio/workflow";

// Signal to request cancellation of the agent loop workflow execution.
// No payload required; the workflow should cancel in-flight activities and finish.
export const cancelAgentLoopSignal = defineSignal<[void]>(
  "cancel_agent_loop_signal"
);

