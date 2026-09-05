import { statsDMetrics } from "@app/lib/utils/statsd";

// StatsD metric names.
export const METRICS = {
  LOOP_COMPLETIONS: "agent_loop.completions",
  LOOP_DURATION: "agent_loop.duration_ms",
  LOOP_STARTS: "agent_loop.starts",
  PHASE_COMPLETIONS: "agent_loop_phase.completions",
  PHASE_DURATION: "agent_loop_phase.duration_ms",
  PHASE_STARTS: "agent_loop_phase.starts",
  PHASE_STEPS: "agent_loop_phase.steps_completed",
  STEP_COMPLETIONS: "agent_loop_step.completions",
  STEP_DURATION: "agent_loop_step.duration_ms",
  STEP_STARTS: "agent_loop_step.starts",
  TIME_TO_ACTIONS_CREATED: "agent_loop_step.time_to_actions_created",
  TIME_TO_CONVERSATION_RENDERED: "agent_loop_step.time_to_conversation_rendered",
  TIME_TO_DATA_LOADED: "agent_loop_step.time_to_data_loaded",
  TIME_TO_PROVIDER_CALL: "agent_loop_step.time_to_provider_call",
  TIME_TO_STREAM_DONE: "agent_loop_step.time_to_stream_done",
  TIME_TO_TOOLS_RESOLVED: "agent_loop_step.time_to_tools_resolved",
} as const;

/**
 * Agent Loop Instrumentation
 *
 * THREE-LEVEL METRICS SYSTEM:
 *
 * 1. **STEP** = Individual model execution + tool(s) execution within a phase
 * 2. **PHASE** = Single execution of `executeAgentLoop` function (contains multiple steps)
 * 3. **LOOP** = Complete agent processing (may span multiple phases)
 *
 * EXAMPLES:
 * - Sync completion: N steps → 1 phase → 1 loop
 * - Sync→async transition: N steps → 2 phases → 1 loop
 * - Approval interruption: N steps → M phases → 1 loop (excludes user wait time)
 *
 * TIMING PARAMETERS:
 * - stepStartTime: When current step started (model + tools execution)
 * - syncStartTime: When current phase started (used for phase duration)
 * - initialStartTime: When agent processing originally began (used for loop duration)
 *
 * METRICS:
 * - `agent_loop_step.*` → Individual step performance (model + tools)
 * - `agent_loop_phase.*` → Individual `executeAgentLoop` performance
 * - `agent_loop.*` → Complete agent loop performance
 *
 * Sink implementations are in `temporal/agent_loop/sinks.ts`.
 */

// Log start of complete agent loop - only called once per loop (from client.ts).
export function logAgentLoopStart(): void {
  statsDMetrics.increment(METRICS.LOOP_STARTS, 1);
}
