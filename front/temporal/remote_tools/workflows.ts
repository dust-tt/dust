import { proxyActivities } from "@temporalio/workflow";

import type * as activities from "@app/temporal/remote_tools/activities";

const { syncRemoteMCPServers, getBatchRemoteMCPServers } = proxyActivities<
  typeof activities
>({
  startToCloseTimeout: "10 minutes",
});

export async function syncRemoteMCPServersWorkflow() {
  let ids = await getBatchRemoteMCPServers({
    firstId: 0,
    limit: 100,
  });
  do {
    await syncRemoteMCPServers(ids);
    ids = await getBatchRemoteMCPServers({
      firstId: ids[ids.length - 1] + 1,
      limit: 100,
    });
  } while (ids.length > 0);
}
