import type { Authenticator } from "@app/lib/auth";
import { RemoteMCPServerResource } from "@app/lib/resources/remote_mcp_servers_resource";
import { isResourceSId } from "@app/lib/resources/string_ids";
import { asDisplayToolName } from "@app/types/shared/utils/string_utils";

export type AvailableTool = {
  serverName: string;
  displayName: string;
  totalExecutions: number;
};

export async function resolveServerDisplayNames(
  auth: Authenticator,
  serverNames: string[]
): Promise<Map<string, string>> {
  const unique = [...new Set(serverNames)];
  const remoteServerIds = unique.filter((id) =>
    isResourceSId("remote_mcp_server", id)
  );
  const remoteServers = await RemoteMCPServerResource.fetchByIds(
    auth,
    remoteServerIds
  );
  const remoteServerMap = new Map(
    remoteServers.map((server) => [server.sId, server])
  );

  const displayMap = new Map<string, string>();
  for (const name of unique) {
    displayMap.set(
      name,
      remoteServerMap.get(name)?.cachedName ?? asDisplayToolName(name)
    );
  }
  return displayMap;
}

export async function resolveToolDisplayNames(
  auth: Authenticator,
  tools: AvailableTool[]
): Promise<AvailableTool[]> {
  const displayMap = await resolveServerDisplayNames(
    auth,
    tools.map((t) => t.serverName)
  );

  return tools.map((tool) => ({
    ...tool,
    displayName: displayMap.get(tool.serverName) ?? tool.serverName,
  }));
}
