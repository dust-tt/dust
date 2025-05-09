import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";

import type { InternalMCPServerNameType } from "@app/lib/actions/mcp_internal_actions/constants";
import { default as agentRouterServer } from "@app/lib/actions/mcp_internal_actions/servers/agent_router";
import { default as askAgentServer } from "@app/lib/actions/mcp_internal_actions/servers/ask_agent";
import { default as childAgentDebuggerServer } from "@app/lib/actions/mcp_internal_actions/servers/child_agent_debugger";
import { default as generateFileServer } from "@app/lib/actions/mcp_internal_actions/servers/file_generation";
import { default as githubServer } from "@app/lib/actions/mcp_internal_actions/servers/github";
import { default as hubspotServer } from "@app/lib/actions/mcp_internal_actions/servers/hubspot/server";
import { default as imageGenerationDallEServer } from "@app/lib/actions/mcp_internal_actions/servers/image_generation";
import { default as includeDataServer } from "@app/lib/actions/mcp_internal_actions/servers/include";
import { default as primitiveTypesDebuggerServer } from "@app/lib/actions/mcp_internal_actions/servers/primitive_types_debugger";
import { default as reasoningServer } from "@app/lib/actions/mcp_internal_actions/servers/reasoning";
import { default as searchServer } from "@app/lib/actions/mcp_internal_actions/servers/search";
import { default as tablesQueryServer } from "@app/lib/actions/mcp_internal_actions/servers/tables_query";
import { default as thinkServer } from "@app/lib/actions/mcp_internal_actions/servers/think";
import { default as webtoolsServer } from "@app/lib/actions/mcp_internal_actions/servers/webtools";
import type { AgentLoopContextType } from "@app/lib/actions/types";
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
  },
  agentLoopContext?: AgentLoopContextType
): McpServer {
  switch (internalMCPServerName) {
    case "github":
      return githubServer(auth, mcpServerId);
    case "hubspot":
      return hubspotServer(auth, mcpServerId);
    case "image_generation":
      return imageGenerationDallEServer(auth);
    case "file_generation":
      return generateFileServer(auth);
    case "child_agent_debugger":
      return childAgentDebuggerServer();
    case "query_tables":
      return tablesQueryServer(auth, agentLoopContext);
    case "primitive_types_debugger":
      return primitiveTypesDebuggerServer();
    case "think":
      return thinkServer();
    case "web_search_&_browse_v2":
      return webtoolsServer(agentLoopContext);
    case "search":
      return searchServer(auth, agentLoopContext);
    case "include_data":
      return includeDataServer(auth, agentLoopContext);
    case "ask_agent":
      return askAgentServer(auth);
    case "reasoning_v2":
      return reasoningServer(auth, agentLoopContext);
    case "agent_router":
      return agentRouterServer(auth);
    default:
      assertNever(internalMCPServerName);
  }
}
