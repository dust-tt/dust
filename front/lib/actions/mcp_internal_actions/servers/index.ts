import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";

import type { InternalMCPServerNameType } from "@app/lib/actions/mcp_internal_actions/constants";
import { default as dataSourceUtilsServer } from "@app/lib/actions/mcp_internal_actions/servers/data_source_utils";
import { default as helloWorldServer } from "@app/lib/actions/mcp_internal_actions/servers/helloworld";
import { default as tableUtilsServer } from "@app/lib/actions/mcp_internal_actions/servers/table_utils";
import type { Authenticator } from "@app/lib/auth";
import { assertNever } from "@app/types";

export function getInternalMCPServer(
  auth: Authenticator,
  {
    internalMCPServerName,
    mcpServerId,
  }: {
    internalMCPServerName: InternalMCPServerNameType;
    mcpServerId: string;
  }
): McpServer {
  switch (internalMCPServerName) {
    case "helloworld":
      return helloWorldServer(auth, mcpServerId);
    case "data-source-utils":
      return dataSourceUtilsServer();
    case "table-utils":
      return tableUtilsServer();
    default:
      assertNever(internalMCPServerName);
  }
}
