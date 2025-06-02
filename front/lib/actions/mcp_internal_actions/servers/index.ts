import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";

import type { InternalMCPServerNameType } from "@app/lib/actions/mcp_internal_actions/constants";
import { default as agentRouterServer } from "@app/lib/actions/mcp_internal_actions/servers/agent_router";
import { default as companyFilesServer } from "@app/lib/actions/mcp_internal_actions/servers/content_nodes";
import { default as generateFileServer } from "@app/lib/actions/mcp_internal_actions/servers/file_generation";
import { default as githubServer } from "@app/lib/actions/mcp_internal_actions/servers/github";
import { default as gmailServer } from "@app/lib/actions/mcp_internal_actions/servers/gmail";
import { default as hubspotServer } from "@app/lib/actions/mcp_internal_actions/servers/hubspot/server";
import { default as imageGenerationDallEServer } from "@app/lib/actions/mcp_internal_actions/servers/image_generation";
import { default as includeDataServer } from "@app/lib/actions/mcp_internal_actions/servers/include";
import { default as missingActionCatcherServer } from "@app/lib/actions/mcp_internal_actions/servers/missing_action_catcher";
import { default as notionServer } from "@app/lib/actions/mcp_internal_actions/servers/notion";
import { default as primitiveTypesDebuggerServer } from "@app/lib/actions/mcp_internal_actions/servers/primitive_types_debugger";
import { default as extractDataServer } from "@app/lib/actions/mcp_internal_actions/servers/process";
import { default as reasoningServer } from "@app/lib/actions/mcp_internal_actions/servers/reasoning";
import { default as runAgentServer } from "@app/lib/actions/mcp_internal_actions/servers/run_agent";
import { default as dustAppServer } from "@app/lib/actions/mcp_internal_actions/servers/run_dust_app";
import { default as salesforceServer } from "@app/lib/actions/mcp_internal_actions/servers/salesforce";
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
  agentLoopContext?: AgentLoopContextType
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
      return tablesQueryServer(auth, agentLoopContext);
    case "query_tables_v2":
      return tablesQueryServerV2(auth, agentLoopContext);
    case "primitive_types_debugger":
      return primitiveTypesDebuggerServer();
    case "think":
      return thinkServer();
    case "web_search_&_browse":
      return webtoolsServer(agentLoopContext);
    case "search":
      return searchServer(auth, agentLoopContext);
    case "missing_action_catcher":
      return missingActionCatcherServer(auth, agentLoopContext);
    case "notion":
      return notionServer(auth, mcpServerId);
    case "include_data":
      return includeDataServer(auth, agentLoopContext);
    case "run_agent":
      return runAgentServer(auth);
    case "reasoning":
      return reasoningServer(auth, agentLoopContext);
    case "run_dust_app":
      return dustAppServer(auth, agentLoopContext);
    case "agent_router":
      return agentRouterServer(auth);
    case "extract_data":
      return extractDataServer(auth, agentLoopContext);
    case "salesforce":
      return salesforceServer(auth, mcpServerId);
    case "gmail":
      return gmailServer(auth, mcpServerId);
    case "company_files":
      return companyFilesServer();
    default:
      assertNever(internalMCPServerName);
  }
}
