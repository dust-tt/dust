import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";

import type { InternalMCPServerNameType } from "@app/lib/actions/mcp_internal_actions/constants";
import { default as askAgentServer } from "@app/lib/actions/mcp_internal_actions/servers/ask_agent";
import { default as dataSourceUtilsServer } from "@app/lib/actions/mcp_internal_actions/servers/data_source_utils";
import { default as generateFileServer } from "@app/lib/actions/mcp_internal_actions/servers/generate_file";
import { default as imageGenerationDallEServer } from "@app/lib/actions/mcp_internal_actions/servers/generate_image";
import { default as githubServer } from "@app/lib/actions/mcp_internal_actions/servers/github";
import { default as helloWorldServer } from "@app/lib/actions/mcp_internal_actions/servers/hello_world";
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
    case "hello_world":
      return helloWorldServer(auth, mcpServerId);
    case "data_source_utils":
      return dataSourceUtilsServer();
    case "table_utils":
      return tableUtilsServer();
    case "github":
      return githubServer(auth, mcpServerId);
    case "generate_image":
      return imageGenerationDallEServer(auth);
    case "ask_agent":
      return askAgentServer();
    case "generate_file":
      return generateFileServer();
    default:
      assertNever(internalMCPServerName);
  }
}
