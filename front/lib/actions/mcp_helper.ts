import type { AgentBuilderAction } from "@app/components/agent_builder/AgentBuilderFormContext";
import type { AssistantBuilderMCPConfiguration } from "@app/components/assistant_builder/types";
import type { InternalMCPServerNameType } from "@app/lib/actions/mcp_internal_actions/constants";
import {
  getInternalMCPServerNameAndWorkspaceId,
  INTERNAL_MCP_SERVERS,
} from "@app/lib/actions/mcp_internal_actions/constants";
import type {
  MCPServerType,
  MCPServerViewType,
  RemoteMCPServerType,
} from "@app/lib/api/mcp";
import {
  getResourceNameAndIdFromSId,
  makeSId,
} from "@app/lib/resources/string_ids";
import type { ModelId } from "@app/types";
import { asDisplayName } from "@app/types";

export const getServerTypeAndIdFromSId = (
  mcpServerId: string
): {
  serverType: "internal" | "remote";
  id: number;
} => {
  const sIdParts = getResourceNameAndIdFromSId(mcpServerId);
  if (!sIdParts) {
    throw new Error(`Invalid MCP server ID: ${mcpServerId}`);
  }

  const { resourceName, resourceModelId } = sIdParts;

  switch (resourceName) {
    case "internal_mcp_server":
      return { serverType: "internal" as const, id: resourceModelId };
    case "remote_mcp_server":
      return { serverType: "remote" as const, id: resourceModelId };
    default:
      throw new Error(
        `Invalid MCP server ID: ${mcpServerId} resourceName: ${resourceName}`
      );
  }
};

export const internalMCPServerNameToSId = ({
  name,
  workspaceId,
}: {
  name: InternalMCPServerNameType;
  workspaceId: ModelId;
}): string => {
  return makeSId("internal_mcp_server", {
    id: INTERNAL_MCP_SERVERS[name].id,
    workspaceId,
  });
};

export const remoteMCPServerNameToSId = ({
  remoteMCPServerId,
  workspaceId,
}: {
  remoteMCPServerId: ModelId;
  workspaceId: ModelId;
}): string => {
  return makeSId("remote_mcp_server", {
    id: remoteMCPServerId,
    workspaceId,
  });
};

export const mcpServerViewSortingFn = (
  a: MCPServerViewType,
  b: MCPServerViewType
) => {
  return mcpServersSortingFn({ mcpServer: a.server }, { mcpServer: b.server });
};

export const mcpServersSortingFn = (
  a: { mcpServer: MCPServerType },
  b: { mcpServer: MCPServerType }
) => {
  const { serverType: aServerType } = getServerTypeAndIdFromSId(
    a.mcpServer.sId
  );
  const { serverType: bServerType } = getServerTypeAndIdFromSId(
    b.mcpServer.sId
  );
  if (aServerType === bServerType) {
    return a.mcpServer.name.localeCompare(b.mcpServer.name);
  }
  return aServerType < bServerType ? -1 : 1;
};

export function isRemoteMCPServerType(
  server: MCPServerType
): server is RemoteMCPServerType {
  const serverType = getServerTypeAndIdFromSId(server.sId).serverType;
  return serverType === "remote";
}

export function getMcpServerViewDisplayName(
  view: MCPServerViewType,
  action?: AssistantBuilderMCPConfiguration | AgentBuilderAction
) {
  return getMcpServerDisplayName(view.server, action);
}

export function getMcpServerDisplayName(
  server: MCPServerType,
  action?: AssistantBuilderMCPConfiguration | AgentBuilderAction
) {
  // Unreleased internal servers are displayed with a suffix in the UI.
  const res = getInternalMCPServerNameAndWorkspaceId(server.sId);
  let displayName = asDisplayName(server.name);

  if (res.isOk()) {
    const isCustomName = action?.name && action.name !== server.name;

    // If there is a custom name, add it to the display name (except run_dust_app, which is handled below).
    if (isCustomName && res.value.name !== "run_dust_app") {
      displayName += " - " + asDisplayName(action.name);
    }

    const serverConfig = INTERNAL_MCP_SERVERS[res.value.name];

    if (serverConfig.isPreview === true) {
      displayName += " (Preview)";
    }
    // Will append Dust App name.
    if (res.value.name === "run_dust_app" && action) {
      displayName += " - " + action.name;
    }
  }
  return displayName;
}
