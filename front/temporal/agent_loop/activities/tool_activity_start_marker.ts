import type { ToolActivityExecution } from "@app/temporal/agent_loop/lib/tool_activity_start_marker";
import { claimToolActivityNeverStarted } from "@app/temporal/agent_loop/lib/tool_activity_start_marker";

export async function claimToolActivityNeverStartedActivity(
  execution: ToolActivityExecution
): Promise<boolean> {
  return claimToolActivityNeverStarted(execution);
}
