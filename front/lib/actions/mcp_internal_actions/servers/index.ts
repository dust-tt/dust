import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";

import type { InternalMCPServerNameType } from "@app/lib/actions/mcp_internal_actions/constants";
import { default as helloWorldServer } from "@app/lib/actions/mcp_internal_actions/servers/authentication_debugger";
import { default as askAgentServer } from "@app/lib/actions/mcp_internal_actions/servers/child_agent_debugger";
import { default as dataSourceUtilsServer } from "@app/lib/actions/mcp_internal_actions/servers/data_sources_debugger";
import { default as generateFileServer } from "@app/lib/actions/mcp_internal_actions/servers/file_generation";
import { default as githubServer } from "@app/lib/actions/mcp_internal_actions/servers/github";
import { default as imageGenerationDallEServer } from "@app/lib/actions/mcp_internal_actions/servers/image_generation";
import { default as primitiveTypesDebuggerServer } from "@app/lib/actions/mcp_internal_actions/servers/primitive_types_debugger";
import { default as tableUtilsServer } from "@app/lib/actions/mcp_internal_actions/servers/tables_debugger";
import { default as thinkServer } from "@app/lib/actions/mcp_internal_actions/servers/think";
import { default as webtoolsServer } from "@app/lib/actions/mcp_internal_actions/servers/webtools";
import { default as tablesQueryServer } from "@app/lib/actions/mcp_internal_actions/servers/tables_query";
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
    case "authentication_debugger":
      return helloWorldServer(auth, mcpServerId);
    case "data_sources_debugger":
      return dataSourceUtilsServer();
    case "tables_debugger":
      return tableUtilsServer();
    case "github":
      return githubServer(auth, mcpServerId);
    case "image_generation":
      return imageGenerationDallEServer(auth);
    case "file_generation":
      return generateFileServer(auth);
    case "child_agent_debugger":
      return askAgentServer();
    case "tables_query":
      return tablesQueryServer();
    case "primitive_types_debugger":
      return primitiveTypesDebuggerServer();
    case "think":
      return thinkServer();
    case "web_search_&_browse_v2":
      return webtoolsServer();
    default:
      assertNever(internalMCPServerName);
  }
}
