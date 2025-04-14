import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";

import type { InternalMCPServerNameType } from "@app/lib/actions/mcp_internal_actions/constants";
import { default as helloWorldServer } from "@app/lib/actions/mcp_internal_actions/servers/authentication_debugger";
import { default as askAgentServer } from "@app/lib/actions/mcp_internal_actions/servers/child_agent_debugger";
import { default as dataSourceUtilsServer } from "@app/lib/actions/mcp_internal_actions/servers/data_sources_debugger";
import { default as generateFileServer } from "@app/lib/actions/mcp_internal_actions/servers/file_generator";
import { default as githubServer } from "@app/lib/actions/mcp_internal_actions/servers/github";
import { default as imageGenerationDallEServer } from "@app/lib/actions/mcp_internal_actions/servers/image_generator";
import { default as primitiveTypesDebuggerServer } from "@app/lib/actions/mcp_internal_actions/servers/primitive_types_debugger";
import { default as tableUtilsServer } from "@app/lib/actions/mcp_internal_actions/servers/tables_debugger";
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
    case "image_generator":
      return imageGenerationDallEServer(auth);
    case "file_generator":
      return generateFileServer();
    case "child_agent_debugger":
      return askAgentServer();
    case "primitive_types_debugger":
      return primitiveTypesDebuggerServer();
    default:
      assertNever(internalMCPServerName);
  }
}
