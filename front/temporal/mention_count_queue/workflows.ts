import { proxyActivities } from "@temporalio/workflow";

import type * as activities from "@app/temporal/mention_count_queue/activities";

const { mentionCountActivity } = proxyActivities<typeof activities>({
  startToCloseTimeout: "10 minutes",
});

export async function mentionCountWorkflow(workspaceId: string) {
  await mentionCountActivity(workspaceId);
}
