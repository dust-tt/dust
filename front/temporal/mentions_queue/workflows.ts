import { proxyActivities } from "@temporalio/workflow";

import type { Authenticator } from "@app/lib/auth";
import type * as activities from "@app/temporal/mentions_queue/activities";
import type { AgentLoopArgs } from "@app/types/assistant/agent_run";

const { handleMentionsActivity } = proxyActivities<typeof activities>({
  startToCloseTimeout: "1 minute",
  retry: {
    maximumAttempts: 2,
  },
});

export async function handleMentionsWorkflow(
  auth: Authenticator,
  {
    agentLoopArgs,
  }: {
    agentLoopArgs: AgentLoopArgs;
  }
): Promise<void> {
  await handleMentionsActivity(auth, agentLoopArgs);
}
