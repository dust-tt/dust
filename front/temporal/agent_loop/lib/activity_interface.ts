import type {
  logAgentLoopPhaseCompletionActivity,
  logAgentLoopPhaseStartActivity,
  logAgentLoopStepCompletionActivity,
} from "@app/temporal/agent_loop/activities/instrumentation";
import type { publishDeferredEventsActivity } from "@app/temporal/agent_loop/activities/publish_deferred_events";
import type { runModelAndCreateActionsActivity } from "@app/temporal/agent_loop/activities/run_model_and_create_actions_wrapper";
import type { runToolActivity } from "@app/temporal/agent_loop/activities/run_tool";

export interface AgentLoopActivities {
  logAgentLoopPhaseCompletionActivity: typeof logAgentLoopPhaseCompletionActivity;
  logAgentLoopPhaseStartActivity: typeof logAgentLoopPhaseStartActivity;
  logAgentLoopStepCompletionActivity: typeof logAgentLoopStepCompletionActivity;
  publishDeferredEventsActivity: typeof publishDeferredEventsActivity;
  runModelAndCreateActionsActivity: typeof runModelAndCreateActionsActivity;
  runToolActivity: typeof runToolActivity;
}
