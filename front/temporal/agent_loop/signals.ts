import { defineSignal } from "@temporalio/workflow";

// Signal to request cancellation of the agent loop workflow execution.
// No payload required; the workflow should cancel in-flight activities and finish.
export const cancelAgentLoopSignal = defineSignal<[void]>(
  "cancel_agent_loop_signal"
);

// Signal to request a graceful stop of the agent loop workflow. Unlike cancellation, in-flight
// activities continue to completion. The loop exits cleanly at the next step boundary.
export const gracefullyStopAgentLoopSignal = defineSignal<[void]>(
  "gracefully_stop_agent_loop_signal"
);

// Signal to immediately cancel in-flight activities (like cancelAgentLoopSignal) but continue
// processing any pending queued messages afterwards, unlike a full cancel.
export const interruptAgentLoopSignal = defineSignal<[void]>(
  "interrupt_agent_loop_signal"
);
