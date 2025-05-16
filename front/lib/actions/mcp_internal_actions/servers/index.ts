import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";

import type { InternalMCPServerNameType } from "@app/lib/actions/mcp_internal_actions/constants";
import { default as agentRouterServer } from "@app/lib/actions/mcp_internal_actions/servers/agent_router";
import { default as askAgentServer } from "@app/lib/actions/mcp_internal_actions/servers/ask_agent";
import { default as generateFileServer } from "@app/lib/actions/mcp_internal_actions/servers/file_generation";
import { default as githubServer } from "@app/lib/actions/mcp_internal_actions/servers/github";
import { default as hubspotServer } from "@app/lib/actions/mcp_internal_actions/servers/hubspot/server";
import { default as imageGenerationDallEServer } from "@app/lib/actions/mcp_internal_actions/servers/image_generation";
import { default as includeDataServer } from "@app/lib/actions/mcp_internal_actions/servers/include";
import { default as notionServer } from "@app/lib/actions/mcp_internal_actions/servers/notion";
import { default as primitiveTypesDebuggerServer } from "@app/lib/actions/mcp_internal_actions/servers/primitive_types_debugger";
import { default as reasoningServer } from "@app/lib/actions/mcp_internal_actions/servers/reasoning";
import { default as dustAppServer } from "@app/lib/actions/mcp_internal_actions/servers/run_dust_app";
import { default as searchServer } from "@app/lib/actions/mcp_internal_actions/servers/search";
import { default as tablesQueryServer } from "@app/lib/actions/mcp_internal_actions/servers/tables_query/server";
import { default as tablesQueryServerV2 } from "@app/lib/actions/mcp_internal_actions/servers/tables_query/server_v2";
import { default as thinkServer } from "@app/lib/actions/mcp_internal_actions/servers/think";
import { default as webtoolsServer } from "@app/lib/actions/mcp_internal_actions/servers/webtools";
import type { AgentLoopContextType } from "@app/lib/actions/types";
import type { Authenticator } from "@app/lib/auth";
import { assertNever } from "@app/types";

export async function getInternalMCPServer(
  auth: Authenticator,
  {
    internalMCPServerName,
    mcpServerId,
  }: {
    internalMCPServerName: InternalMCPServerNameType;
    mcpServerId: string;
  },
  agentLoopContext: AgentLoopContextType
): Promise<McpServer> {
  switch (internalMCPServerName) {
    case "github":
      return githubServer(auth, mcpServerId);
    case "hubspot":
      return hubspotServer(auth, mcpServerId);
    case "image_generation":
      return imageGenerationDallEServer(auth);
    case "file_generation":
      return generateFileServer(auth);
    case "query_tables":
      return tablesQueryServer(auth, agentLoopContext.runContext);
    case "query_tables_v2":
      return tablesQueryServerV2(auth, agentLoopContext.runContext);
    case "primitive_types_debugger":
      return primitiveTypesDebuggerServer();
    case "think":
      return thinkServer();
    case "web_search_&_browse":
      return webtoolsServer(agentLoopContext.runContext);
    case "search":
      return searchServer(auth, agentLoopContext);
    case "notion":
      return notionServer(auth, mcpServerId);
    case "include_data":
      return includeDataServer(auth, agentLoopContext);
    case "ask_agent":
      return askAgentServer(auth);
    case "reasoning_v2":
      return reasoningServer(auth, agentLoopContext.runContext);
    case "run_dust_app":
      return dustAppServer(auth, agentLoopContext);
    case "agent_router":
      return agentRouterServer(auth);
    default:
      assertNever(internalMCPServerName);
  }
}
