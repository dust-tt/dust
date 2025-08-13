import type { runModelAndCreateActionsActivity } from "@app/temporal/agent_loop/activities/run_model_and_create_actions_wrapper";
import type { runToolActivity } from "@app/temporal/agent_loop/activities/run_tool";

export interface AgentLoopActivities {
  runModelAndCreateActionsActivity: typeof runModelAndCreateActionsActivity;
  runToolActivity: typeof runToolActivity;
}
