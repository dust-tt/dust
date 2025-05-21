import { proxyActivities } from "@temporalio/workflow";
import { RemoteMCPServerResource } from "@app/lib/resources/remote_mcp_servers_resource";

import type * as activities from "@app/temporal/remote_tools/activities";

const { syncRemoteMCPServers, getBatchRemoteMCPServers } = proxyActivities<
  typeof activities
>({
  startToCloseTimeout: "10 minutes",
});

export async function syncRemoteMCPServersWorkflow() {
  let batch = await getBatchRemoteMCPServers();
  while (batch.servers.length > 0) {
    await syncRemoteMCPServers(batch.servers);
    batch = await batch.next();
  }
}
