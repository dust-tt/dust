import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";

import type { InternalMCPServerNameType } from "@app/lib/actions/mcp_internal_actions/constants";
import { ADVANCED_SEARCH_SWITCH } from "@app/lib/actions/mcp_internal_actions/constants";
import { default as agentManagementServer } from "@app/lib/actions/mcp_internal_actions/servers/agent_management";
import { default as agentMemoryServer } from "@app/lib/actions/mcp_internal_actions/servers/agent_memory";
import { default as agentRouterServer } from "@app/lib/actions/mcp_internal_actions/servers/agent_router";
import { default as contentCreationServer } from "@app/lib/actions/mcp_internal_actions/servers/content_creation";
import { default as conversationFilesServer } from "@app/lib/actions/mcp_internal_actions/servers/conversation_files";
import { default as dataSourcesFileSystemServer } from "@app/lib/actions/mcp_internal_actions/servers/data_sources_file_system";
import { default as dataWarehousesServer } from "@app/lib/actions/mcp_internal_actions/servers/data_warehouses/server";
import { default as deepResearchServer } from "@app/lib/actions/mcp_internal_actions/servers/deep_research";
import { default as generateFileServer } from "@app/lib/actions/mcp_internal_actions/servers/file_generation";
import { default as freshserviceServer } from "@app/lib/actions/mcp_internal_actions/servers/freshservice/server";
import { default as githubServer } from "@app/lib/actions/mcp_internal_actions/servers/github";
import { default as gmailServer } from "@app/lib/actions/mcp_internal_actions/servers/gmail";
import { default as calendarServer } from "@app/lib/actions/mcp_internal_actions/servers/google_calendar";
import { default as driveServer } from "@app/lib/actions/mcp_internal_actions/servers/google_drive";
import { default as sheetsServer } from "@app/lib/actions/mcp_internal_actions/servers/google_sheets";
import { default as hubspotServer } from "@app/lib/actions/mcp_internal_actions/servers/hubspot/server";
import { default as imageGenerationDallEServer } from "@app/lib/actions/mcp_internal_actions/servers/image_generation";
import { default as includeDataServer } from "@app/lib/actions/mcp_internal_actions/servers/include";
import { default as jiraServer } from "@app/lib/actions/mcp_internal_actions/servers/jira/server";
import { default as jitToolDatasourceSettingDebuggerServer } from "@app/lib/actions/mcp_internal_actions/servers/jit_tool_datasource_setting_debugger";
import { default as jitToolStringSettingDebuggerServer } from "@app/lib/actions/mcp_internal_actions/servers/jit_tool_string_setting_debugger";
import { default as missingActionCatcherServer } from "@app/lib/actions/mcp_internal_actions/servers/missing_action_catcher";
import { default as mondayServer } from "@app/lib/actions/mcp_internal_actions/servers/monday/server";
import { default as notionServer } from "@app/lib/actions/mcp_internal_actions/servers/notion";
import { default as outlookCalendarServer } from "@app/lib/actions/mcp_internal_actions/servers/outlook/calendar_server";
import { default as outlookServer } from "@app/lib/actions/mcp_internal_actions/servers/outlook/server";
import { default as primitiveTypesDebuggerServer } from "@app/lib/actions/mcp_internal_actions/servers/primitive_types_debugger";
import { default as extractDataServer } from "@app/lib/actions/mcp_internal_actions/servers/process";
import { default as reasoningServer } from "@app/lib/actions/mcp_internal_actions/servers/reasoning";
import { default as runAgentServer } from "@app/lib/actions/mcp_internal_actions/servers/run_agent";
import { default as dustAppServer } from "@app/lib/actions/mcp_internal_actions/servers/run_dust_app";
import { default as salesforceServer } from "@app/lib/actions/mcp_internal_actions/servers/salesforce";
import { default as searchServer } from "@app/lib/actions/mcp_internal_actions/servers/search";
import { default as slackServer } from "@app/lib/actions/mcp_internal_actions/servers/slack";
import { default as slideshowServer } from "@app/lib/actions/mcp_internal_actions/servers/slideshow";
import { default as tablesQueryServer } from "@app/lib/actions/mcp_internal_actions/servers/tables_query/server";
import { default as tablesQueryServerV2 } from "@app/lib/actions/mcp_internal_actions/servers/tables_query/server_v2";
import { default as thinkServer } from "@app/lib/actions/mcp_internal_actions/servers/think";
import { default as toolsetsServer } from "@app/lib/actions/mcp_internal_actions/servers/toolsets";
import { default as webtoolsServer } from "@app/lib/actions/mcp_internal_actions/servers/webtools";
import type { AgentLoopContextType } from "@app/lib/actions/types";
import {
  isLightServerSideMCPToolConfiguration,
  isServerSideMCPServerConfiguration,
} from "@app/lib/actions/types/guards";
import type { Authenticator } from "@app/lib/auth";
import { assertNever } from "@app/types";

/**
 * Check if we are in advanced search mode,
 * relying on a magic value stored in the additionalConfiguration.
 */
function isAdvancedSearchMode(agentLoopContext?: AgentLoopContextType) {
  return (
    (agentLoopContext?.runContext &&
      isLightServerSideMCPToolConfiguration(
        agentLoopContext.runContext.toolConfiguration
      ) &&
      agentLoopContext.runContext.toolConfiguration.additionalConfiguration[
        ADVANCED_SEARCH_SWITCH
      ] === true) ||
    (agentLoopContext?.listToolsContext &&
      isServerSideMCPServerConfiguration(
        agentLoopContext.listToolsContext.agentActionConfiguration
      ) &&
      agentLoopContext.listToolsContext.agentActionConfiguration
        .additionalConfiguration[ADVANCED_SEARCH_SWITCH] === true)
  );
}

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
      return githubServer(auth);
    case "hubspot":
      return hubspotServer();
    case "image_generation":
      return imageGenerationDallEServer(auth);
    case "file_generation":
      return generateFileServer(auth);
    case "content_creation":
      return contentCreationServer(auth, agentLoopContext);
    case "query_tables":
      return tablesQueryServer(auth, agentLoopContext);
    case "query_tables_v2":
      return tablesQueryServerV2(auth, agentLoopContext);
    case "primitive_types_debugger":
      return primitiveTypesDebuggerServer();
    case "jit_tool_string_setting_debugger":
      return jitToolStringSettingDebuggerServer();
    case "jit_tool_datasource_setting_debugger":
      return jitToolDatasourceSettingDebuggerServer();
    case "think":
      return thinkServer();
    case "web_search_&_browse":
      return webtoolsServer(agentLoopContext);
    case "search":
      // If we are in advanced search mode, we use the data_sources_file_system server instead.
      if (isAdvancedSearchMode(agentLoopContext)) {
        return dataSourcesFileSystemServer(auth, agentLoopContext);
      }
      return searchServer(auth, agentLoopContext);
    case "slideshow":
      return slideshowServer(auth, agentLoopContext);
    case "missing_action_catcher":
      return missingActionCatcherServer(auth, agentLoopContext);
    case "notion":
      return notionServer(auth, agentLoopContext);
    case "include_data":
      return includeDataServer(auth, agentLoopContext);
    case "run_agent":
      return runAgentServer(auth, agentLoopContext);
    case "reasoning":
      return reasoningServer(auth, agentLoopContext);
    case "run_dust_app":
      return dustAppServer(auth, agentLoopContext);
    case "agent_router":
      return agentRouterServer(auth);
    case "extract_data":
      return extractDataServer(auth, agentLoopContext);
    case "salesforce":
      return salesforceServer();
    case "gmail":
      return gmailServer();
    case "google_calendar":
      return calendarServer();
    case "google_drive":
      return driveServer();
    case "google_sheets":
      return sheetsServer();
    case "data_sources_file_system":
      return dataSourcesFileSystemServer(auth, agentLoopContext);
    case "conversation_files":
      return conversationFilesServer(auth, agentLoopContext);
    case "jira":
      return jiraServer();
    case "monday":
      return mondayServer();
    case "slack":
      return slackServer(auth, mcpServerId, agentLoopContext);
    case "agent_memory":
      return agentMemoryServer(auth, agentLoopContext);
    case "outlook":
      return outlookServer();
    case "outlook_calendar":
      return outlookCalendarServer();
    case "agent_management":
      return agentManagementServer(auth, agentLoopContext);
    case "freshservice":
      return freshserviceServer();
    case "data_warehouses":
      return dataWarehousesServer(auth, agentLoopContext);
    case "toolsets":
      return toolsetsServer(auth, agentLoopContext);
    case "deep_research":
      return deepResearchServer(auth, agentLoopContext);
    default:
      assertNever(internalMCPServerName);
  }
}
