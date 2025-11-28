import { proxyActivities } from "@temporalio/workflow";

import type * as activities from "@app/temporal/es_indexation/activities";

const { indexUserSearchActivity } = proxyActivities<typeof activities>({
  startToCloseTimeout: "5 minutes",
});

export async function indexUserSearchWorkflow({
  userId,
}: {
  userId: string;
}): Promise<void> {
  await indexUserSearchActivity({ userId });
}
