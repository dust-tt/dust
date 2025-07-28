import type { runModelActivity } from "@app/temporal/agent_loop/activities/run_model";
import type { runToolActivity } from "@app/temporal/agent_loop/activities/run_tool";

export interface AgentLoopActivities {
  runModelActivity: typeof runModelActivity;
  runToolActivity: typeof runToolActivity;
}
