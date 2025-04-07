import type { InternalMCPServerNameType } from "@app/lib/actions/mcp_internal_actions/constants";
import { INTERNAL_MCP_SERVERS } from "@app/lib/actions/mcp_internal_actions/constants";
import {
  getResourceNameAndIdFromSId,
  makeSId,
} from "@app/lib/resources/string_ids";
import type { ModelId } from "@app/types";

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

  const { resourceName, resourceId } = sIdParts;

  switch (resourceName) {
    case "internal_mcp_server":
      return { serverType: "internal" as const, id: resourceId };
    case "remote_mcp_server":
      return { serverType: "remote" as const, id: resourceId };
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
