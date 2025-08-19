import type {
  logAgentLoopPhaseCompletionActivity,
  logAgentLoopPhaseStartActivity,
} from "@app/temporal/agent_loop/activities/instrumentation";
import type { runModelAndCreateActionsActivity } from "@app/temporal/agent_loop/activities/run_model_and_create_actions_wrapper";
import type { runToolActivity } from "@app/temporal/agent_loop/activities/run_tool";

export interface AgentLoopActivities {
  logAgentLoopPhaseCompletionActivity: typeof logAgentLoopPhaseCompletionActivity;
  logAgentLoopPhaseStartActivity: typeof logAgentLoopPhaseStartActivity;
  runModelAndCreateActionsActivity: typeof runModelAndCreateActionsActivity;
  runToolActivity: typeof runToolActivity;
}
