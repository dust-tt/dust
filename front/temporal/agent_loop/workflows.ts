import { proxyActivities } from "@temporalio/workflow";

import type { runModelActivity } from "@app/temporal/agent_loop/activities/run_model";
import type { runToolActivity } from "@app/temporal/agent_loop/activities/run_tool";

const activities = proxyActivities<{
  runModelActivity: typeof runModelActivity;
  runToolActivity: typeof runToolActivity;
}>({
  startToCloseTimeout: "5 minute",
});

export async function agentLoopWorkflow({
  authType,
  runAgentArgs,
}: {
  authType: any; // Will be fixed when we have proper types
  runAgentArgs: any; // Will be fixed when we have proper types
}) {
  // This workflow is a placeholder that will be filled in when we migrate
  // the agent loop to temporal workflows
  throw new Error("Not implemented yet");
}
