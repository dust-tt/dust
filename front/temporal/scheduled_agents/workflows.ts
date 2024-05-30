import { proxyActivities, sleep } from "@temporalio/workflow";

import type * as activities from "@app/temporal/scheduled_agents/activities";

const { test } = proxyActivities<typeof activities>({
  startToCloseTimeout: "1 minutes",
});

export async function scheduleAgentWorkflow({
  scheduledAgentId,
}: {
  scheduledAgentId: string;
}): Promise<void> {
  void scheduledAgentId;
  for (;;) {
    await test();
    await sleep("10 minutes");
  }
}
