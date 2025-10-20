import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";

import type { InternalMCPServerNameType } from "@app/lib/actions/mcp_internal_actions/server_constants";
import {
  ADVANCED_SEARCH_SWITCH,
  AGENT_MEMORY_SERVER_NAME,
} from "@app/lib/actions/mcp_internal_actions/server_constants";
import { default as agentManagementServer } from "@app/lib/actions/mcp_internal_actions/servers/agent_management";
import { default as agentMemoryServer } from "@app/lib/actions/mcp_internal_actions/servers/agent_memory";
import { default as agentRouterServer } from "@app/lib/actions/mcp_internal_actions/servers/agent_router";
import { default as commonUtilitiesServer } from "@app/lib/actions/mcp_internal_actions/servers/common_utilities";
import { default as confluenceServer } from "@app/lib/actions/mcp_internal_actions/servers/confluence";
import { default as conversationFilesServer } from "@app/lib/actions/mcp_internal_actions/servers/conversation_files";
import { default as dataSourcesFileSystemServer } from "@app/lib/actions/mcp_internal_actions/servers/data_sources_file_system";
import { default as dataWarehousesServer } from "@app/lib/actions/mcp_internal_actions/servers/data_warehouses";
import { default as deepDiveServer } from "@app/lib/actions/mcp_internal_actions/servers/deep_dive";
import { default as elevenlabsServer } from "@app/lib/actions/mcp_internal_actions/servers/elevenlabs";
import { default as generateFileServer } from "@app/lib/actions/mcp_internal_actions/servers/file_generation";
import { default as freshserviceServer } from "@app/lib/actions/mcp_internal_actions/servers/freshservice";
import { default as githubServer } from "@app/lib/actions/mcp_internal_actions/servers/github";
import { default as gmailServer } from "@app/lib/actions/mcp_internal_actions/servers/gmail";
import { default as calendarServer } from "@app/lib/actions/mcp_internal_actions/servers/google_calendar";
import { default as driveServer } from "@app/lib/actions/mcp_internal_actions/servers/google_drive";
import { default as sheetsServer } from "@app/lib/actions/mcp_internal_actions/servers/google_sheets";
import { default as hubspotServer } from "@app/lib/actions/mcp_internal_actions/servers/hubspot";
import { default as imageGenerationServer } from "@app/lib/actions/mcp_internal_actions/servers/image_generation";
import { default as includeDataServer } from "@app/lib/actions/mcp_internal_actions/servers/include";
import { default as interactiveContentServer } from "@app/lib/actions/mcp_internal_actions/servers/interactive_content";
import { default as jiraServer } from "@app/lib/actions/mcp_internal_actions/servers/jira";
import { default as jitTestingServer } from "@app/lib/actions/mcp_internal_actions/servers/jit_testing";
import { default as microsoftDriveServer } from "@app/lib/actions/mcp_internal_actions/servers/microsoft/microsoft_drive";
import { default as microsoftTeamsServer } from "@app/lib/actions/mcp_internal_actions/servers/microsoft/microsoft_teams";
import { default as missingActionCatcherServer } from "@app/lib/actions/mcp_internal_actions/servers/missing_action_catcher";
import { default as mondayServer } from "@app/lib/actions/mcp_internal_actions/servers/monday";
import { default as notionServer } from "@app/lib/actions/mcp_internal_actions/servers/notion";
import { default as openaiUsageServer } from "@app/lib/actions/mcp_internal_actions/servers/openai_usage";
import { default as outlookServer } from "@app/lib/actions/mcp_internal_actions/servers/outlook";
import { default as outlookCalendarServer } from "@app/lib/actions/mcp_internal_actions/servers/outlook/calendar_server";
import { default as primitiveTypesDebuggerServer } from "@app/lib/actions/mcp_internal_actions/servers/primitive_types_debugger";
import { default as extractDataServer } from "@app/lib/actions/mcp_internal_actions/servers/process";
import { default as reasoningServer } from "@app/lib/actions/mcp_internal_actions/servers/reasoning";
import { default as runAgentServer } from "@app/lib/actions/mcp_internal_actions/servers/run_agent";
import { default as dustAppServer } from "@app/lib/actions/mcp_internal_actions/servers/run_dust_app";
import { default as salesforceServer } from "@app/lib/actions/mcp_internal_actions/servers/salesforce";
import { default as searchServer } from "@app/lib/actions/mcp_internal_actions/servers/search";
import { default as slackServer } from "@app/lib/actions/mcp_internal_actions/servers/slack";
import { default as slackBotServer } from "@app/lib/actions/mcp_internal_actions/servers/slack_bot";
import { default as slideshowServer } from "@app/lib/actions/mcp_internal_actions/servers/slideshow";
import { default as tablesQueryServerV2 } from "@app/lib/actions/mcp_internal_actions/servers/tables_query";
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
        // eslint-disable-next-line @typescript-eslint/prefer-nullish-coalescing
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
      return githubServer(auth, agentLoopContext) as McpServer;
    case "hubspot":
      return hubspotServer() as McpServer;
    case "image_generation":
      return imageGenerationServer(auth, agentLoopContext) as McpServer;
    case "elevenlabs":
      return elevenlabsServer(auth, agentLoopContext) as McpServer;
    case "file_generation":
      return generateFileServer(auth, agentLoopContext) as McpServer;
    case "interactive_content":
      return interactiveContentServer(auth, agentLoopContext) as McpServer;
    case "query_tables_v2":
      return tablesQueryServerV2(auth, agentLoopContext) as McpServer;
    case "primitive_types_debugger":
      return primitiveTypesDebuggerServer(auth, agentLoopContext) as McpServer;
    case "jit_testing":
      return jitTestingServer(auth, agentLoopContext) as McpServer;
    case "common_utilities":
      return commonUtilitiesServer(auth, agentLoopContext) as McpServer;
    case "web_search_&_browse":
      return webtoolsServer(auth, agentLoopContext) as McpServer;
    case "search":
      // If we are in advanced search mode, we use the data_sources_file_system server instead.
      if (isAdvancedSearchMode(agentLoopContext)) {
        return dataSourcesFileSystemServer(auth, agentLoopContext) as McpServer;
      }
      return searchServer(auth, agentLoopContext) as McpServer;
    case "slideshow":
      return slideshowServer(auth, agentLoopContext) as McpServer;
    case "missing_action_catcher":
      return missingActionCatcherServer(auth, agentLoopContext) as McpServer;
    case "notion":
      return notionServer(auth, agentLoopContext) as McpServer;
    case "openai_usage":
      return openaiUsageServer(auth, agentLoopContext) as McpServer;
    case "include_data":
      return includeDataServer(auth, agentLoopContext) as McpServer;
    case "run_agent":
      return (await runAgentServer(auth, agentLoopContext)) as McpServer;
    case "reasoning":
      return reasoningServer(auth, agentLoopContext) as McpServer;
    case "run_dust_app":
      return (await dustAppServer(auth, agentLoopContext)) as McpServer;
    case "agent_router":
      return agentRouterServer(auth, agentLoopContext) as McpServer;
    case "extract_data":
      return extractDataServer(auth, agentLoopContext) as McpServer;
    case "salesforce":
      return salesforceServer(auth, agentLoopContext) as McpServer;
    case "gmail":
      return gmailServer(auth, agentLoopContext) as McpServer;
    case "google_calendar":
      return calendarServer(auth, agentLoopContext) as McpServer;
    case "google_drive":
      return driveServer(auth, agentLoopContext) as McpServer;
    case "google_sheets":
      return sheetsServer(auth, agentLoopContext) as McpServer;
    case "data_sources_file_system":
      return dataSourcesFileSystemServer(auth, agentLoopContext) as McpServer;
    case "conversation_files":
      return conversationFilesServer(auth, agentLoopContext) as McpServer;
    case "jira":
      return jiraServer(auth, agentLoopContext) as McpServer;
    case "microsoft_drive":
      return microsoftDriveServer(auth, agentLoopContext) as McpServer;
    case "microsoft_teams":
      return microsoftTeamsServer(auth, agentLoopContext) as McpServer;
    case "monday":
      return mondayServer(auth, agentLoopContext) as McpServer;
    case "slack":
      return (await slackServer(auth, mcpServerId, agentLoopContext)) as McpServer;
    case "slack_bot":
      return (await slackBotServer(auth, mcpServerId, agentLoopContext)) as McpServer;
    case AGENT_MEMORY_SERVER_NAME:
      return agentMemoryServer(auth, agentLoopContext) as McpServer;
    case "confluence":
      return confluenceServer(auth, agentLoopContext) as McpServer;
    case "outlook":
      return outlookServer(auth, agentLoopContext) as McpServer;
    case "outlook_calendar":
      return outlookCalendarServer(auth, agentLoopContext) as McpServer;
    case "agent_management":
      return agentManagementServer(auth, agentLoopContext) as McpServer;
    case "freshservice":
      return freshserviceServer(auth, agentLoopContext) as McpServer;
    case "data_warehouses":
      return dataWarehousesServer(auth, agentLoopContext) as McpServer;
    case "toolsets":
      return toolsetsServer(auth, agentLoopContext) as McpServer;
    case "deep_dive":
      return deepDiveServer(auth, agentLoopContext) as McpServer;
    default:
      assertNever(internalMCPServerName);
  }
}
