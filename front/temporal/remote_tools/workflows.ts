import { proxyActivities } from "@temporalio/workflow";
import { RemoteMCPServerResource } from "@app/lib/resources/remote_mcp_servers_resource";

import type * as activities from "@app/temporal/remote_tools/activities";

const { syncRemoteMCPServers } = proxyActivities<typeof activities>({
  startToCloseTimeout: "10 minutes",
});

export async function syncRemoteMCPServersWorkflow({
  servers,
}: {
  servers: RemoteMCPServerResource[];
}) {
  await syncRemoteMCPServers(servers);
}
