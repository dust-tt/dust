import { proxyActivities } from "@temporalio/workflow";

import type * as activities from "@app/temporal/mentions_count_queue/activities";

const { mentionsCountActivity: mentionCountActivity } = proxyActivities<
  typeof activities
>({
  startToCloseTimeout: "2 minutes",
});

export async function mentionsCountWorkflow(workspaceId: string) {
  await mentionCountActivity(workspaceId);
}
