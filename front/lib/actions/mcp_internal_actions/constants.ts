import { getResourceNameAndIdFromSId } from "@app/lib/resources/string_ids";
import type { ModelId, Result, WhitelistableFeature } from "@app/types";
import { Err, Ok } from "@app/types";

export const AVAILABLE_INTERNAL_MCP_SERVER_NAMES = [
  "data_source_utils",
  "hello_world",
  "table_utils",
  "github",
  "ask_agent",
  "generate_image",
  "generate_file",
] as const;

export const INTERNAL_MCP_SERVERS: Record<
  InternalMCPServerNameType,
  {
    id: number;
    isDefault: boolean;
    flag: WhitelistableFeature | null;
  }
> = {
  hello_world: {
    id: 1,
    isDefault: false,
    flag: "mcp_actions",
  },
  data_source_utils: {
    id: 2,
    isDefault: false,
    flag: "mcp_actions",
  },
  table_utils: {
    id: 3,
    isDefault: false,
    flag: "mcp_actions",
  },
  github: {
    id: 4,
    isDefault: false,
    flag: "mcp_actions",
  },
  generate_image: {
    id: 5,
    isDefault: true,
    flag: "mcp_actions",
  },
  ask_agent: {
    id: 6,
    isDefault: false,
    flag: "mcp_actions",
  },
  generate_file: {
    id: 7,
    isDefault: true,
    flag: "mcp_actions",
  },
};

export type InternalMCPServerNameType =
  (typeof AVAILABLE_INTERNAL_MCP_SERVER_NAMES)[number];

export const isDefaultInternalMCPServerByName = (
  name: InternalMCPServerNameType
): boolean => {
  return INTERNAL_MCP_SERVERS[name].isDefault;
};

export const isDefaultInternalMCPServer = (sId: string): boolean => {
  const r = getInternalMCPServerNameAndWorkspaceId(sId);
  if (r.isErr()) {
    return false;
  }
  return isDefaultInternalMCPServerByName(r.value.name);
};

export const getInternalMCPServerNameAndWorkspaceId = (
  sId: string
): Result<
  {
    name: InternalMCPServerNameType;
    workspaceId: ModelId;
  },
  Error
> => {
  const sIdParts = getResourceNameAndIdFromSId(sId);

  if (!sIdParts) {
    return new Err(new Error(`Invalid internal MCPServer sId: ${sId}`));
  }

  if (sIdParts.resourceName !== "internal_mcp_server") {
    return new Err(
      new Error(
        `Invalid internal MCPServer sId: ${sId}, does not refer to an internal MCP server.`
      )
    );
  }

  // Swap keys and values.
  const details = Object.entries(INTERNAL_MCP_SERVERS).find(
    ([, internalMCPServer]) => internalMCPServer.id === sIdParts.resourceId
  );

  if (!details) {
    return new Err(
      new Error(
        `Invalid internal MCPServer sId: ${sId}, ID does not match any known internal MCPServer.`
      )
    );
  }

  if (!isInternalMCPServerName(details[0])) {
    return new Err(
      new Error(`Invalid internal MCPServer name: ${details[0]}, sId: ${sId}`)
    );
  }

  const name = details[0];

  return new Ok({
    name,
    workspaceId: sIdParts.workspaceId,
  });
};

export const isInternalMCPServerName = (
  name: string
): name is InternalMCPServerNameType =>
  AVAILABLE_INTERNAL_MCP_SERVER_NAMES.includes(
    name as InternalMCPServerNameType
  );

export const isValidInternalMCPServerId = (
  workspaceId: ModelId,
  sId: string
): boolean => {
  const r = getInternalMCPServerNameAndWorkspaceId(sId);
  if (r.isOk()) {
    return r.value.workspaceId === workspaceId;
  }

  return false;
};
