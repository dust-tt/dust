import { proxyActivities, sleep } from "@temporalio/workflow";

import type * as activities from "@app/temporal/scheduled_agents/activities";

const { computeWaitTime } = proxyActivities<typeof activities>({
  startToCloseTimeout: "1 minutes",
});

const { runAgent } = proxyActivities<typeof activities>({
  startToCloseTimeout: "5 minutes",
});

export async function scheduleAgentWorkflow({
  scheduledAgentId,
}: {
  scheduledAgentId: string;
}): Promise<void> {
  for (;;) {
    const waitTime = await computeWaitTime(scheduledAgentId);
    await sleep(waitTime);
    await runAgent(scheduledAgentId);
  }
}
