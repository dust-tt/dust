import type { LLMEvent } from "@app/lib/api/llm/types/events";
import { Context, heartbeat } from "@temporalio/activity";

const RUN_MODEL_AND_CREATE_ACTIONS_ACTIVITY_NAME =
  "runModelAndCreateActionsActivity";

export type RunModelAndCreateActionsHeartbeatPhase =
  | "loading_agent_loop_data"
  | "checking_guardrails"
  | "checking_prompt_command"
  | "checking_resume"
  | "resolving_tools"
  | "rendering_conversation"
  | "preparing_model_call"
  | "starting_model_stream"
  | "waiting_model_event"
  | "processing_model_event"
  | "persisting_model_output"
  | "creating_actions"
  | "marking_action_required";

export type RunModelAndCreateActionsHeartbeatDetails = {
  activity: typeof RUN_MODEL_AND_CREATE_ACTIONS_ACTIVITY_NAME;
  attempt: number;
  step: number;
  phase: RunModelAndCreateActionsHeartbeatPhase;
  elapsedMs?: number;
  heartbeatCount?: number;
  lastEventType?: LLMEvent["type"];
  timeSinceLastEventMs?: number;
};

export function heartbeatRunModelAndCreateActionsActivity({
  step,
  phase,
  elapsedMs,
  heartbeatCount,
  lastEventType,
  timeSinceLastEventMs,
}: Omit<
  RunModelAndCreateActionsHeartbeatDetails,
  "activity" | "attempt"
>): void {
  const details: RunModelAndCreateActionsHeartbeatDetails = {
    activity: RUN_MODEL_AND_CREATE_ACTIONS_ACTIVITY_NAME,
    attempt: Context.current().info.attempt,
    step,
    phase,
  };

  if (elapsedMs !== undefined) {
    details.elapsedMs = Math.round(elapsedMs);
  }
  if (heartbeatCount !== undefined) {
    details.heartbeatCount = heartbeatCount;
  }
  if (lastEventType !== undefined) {
    details.lastEventType = lastEventType;
  }
  if (timeSinceLastEventMs !== undefined) {
    details.timeSinceLastEventMs = Math.round(timeSinceLastEventMs);
  }

  heartbeat(details);
}
