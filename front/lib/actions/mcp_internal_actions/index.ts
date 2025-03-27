import type { InMemoryTransport } from "@modelcontextprotocol/sdk/inMemory.js";
import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";

import type { AVAILABLE_INTERNAL_MCPSERVER_NAMES } from "@app/lib/actions/mcp_internal_actions/constants";
import { createServer as dataSourceUtilsServer } from "@app/lib/actions/mcp_internal_actions/data_source_utils";
import { createServer as helloWorldServer } from "@app/lib/actions/mcp_internal_actions/helloworld";
import type { Authenticator } from "@app/lib/auth";
import {
  getResourceNameAndIdFromSId,
  makeSId,
} from "@app/lib/resources/string_ids";
import { assertNever } from "@app/types";

const INTERNAL_MCPSERVER_NAMES_TO_ID: Record<
  InternalMCPServerNameType,
  number
> = {
  helloworld: 1,
  "data-source-utils": 2,
} as const;

export type InternalMCPServerNameType =
  (typeof AVAILABLE_INTERNAL_MCPSERVER_NAMES)[number];

export const getInternalMCPServerSId = (
  auth: Authenticator,
  {
    internalMCPServerName,
  }: { internalMCPServerName: InternalMCPServerNameType }
): string =>
  makeSId("internal_mcp_server", {
    id: INTERNAL_MCPSERVER_NAMES_TO_ID[internalMCPServerName],
    workspaceId: auth.getNonNullableWorkspace().id,
  });

export const getInternalMCPServerId = (
  sId: string
): InternalMCPServerNameType => {
  const sIdParts = getResourceNameAndIdFromSId(sId);

  if (!sIdParts) {
    throw new Error(`Invalid internal MCPServer sId: ${sId}`);
  }

  if (sIdParts.resourceName !== "internal_mcp_server") {
    throw new Error(`Invalid internal MCPServer sId: ${sId}`);
  }

  // Swap keys and values.
  const details = Object.entries(INTERNAL_MCPSERVER_NAMES_TO_ID).find(
    ([, id]) => id === sIdParts.resourceId
  );

  if (!details) {
    throw new Error(`Invalid internal MCPServer sId: ${sId}`);
  }

  return details[0] as InternalMCPServerNameType;
};

export const connectToInternalMCPServer = async (
  mcpServerId: string,
  transport: InMemoryTransport
): Promise<McpServer> => {
  let server: McpServer | undefined;

  const internalMCPServerName = getInternalMCPServerId(mcpServerId);

  switch (internalMCPServerName) {
    case "helloworld":
      server = helloWorldServer();
      break;
    case "data-source-utils":
      server = dataSourceUtilsServer();
      break;
    default:
      assertNever(internalMCPServerName);
  }

  if (!server) {
    throw new Error(
      `Internal MCPServer not found for id ${internalMCPServerName}`
    );
  }

  await server.connect(transport);

  return server;
};
