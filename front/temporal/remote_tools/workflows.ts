import { proxyActivities } from "@temporalio/workflow";

import type * as activities from "@app/temporal/remote_tools/activities";

const { syncRemoteMCPServers } = proxyActivities<typeof activities>({
  startToCloseTimeout: "10 minutes",
});

export async function syncRemoteMCPServersWorkflow() {
  await syncRemoteMCPServers();
}
