import { proxyActivities, sleep } from "@temporalio/workflow";

import type * as activities from "@app/temporal/permissions_queue/activities";

const { updateSpacePermissions } = proxyActivities<typeof activities>({
  startToCloseTimeout: "10 minutes",
});

const DEBOUNCE_TIME = 10 * 1000; // 10 seconds.

export async function updateSpacePermissionsWorkflow({
  spaceId,
  workspaceId,
}: {
  spaceId: string;
  workspaceId: string;
}) {
  await sleep(DEBOUNCE_TIME);

  await updateSpacePermissions({
    spaceId,
    workspaceId,
  });
}
