import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";

import type { InternalMCPServerNameType } from "@app/lib/actions/mcp_internal_actions/constants";
import {
  ADVANCED_SEARCH_SWITCH,
  AGENT_MEMORY_SERVER_NAME,
} from "@app/lib/actions/mcp_internal_actions/constants";
import { default as agentManagementServer } from "@app/lib/actions/mcp_internal_actions/servers/agent_management";
import { default as agentMemoryServer } from "@app/lib/actions/mcp_internal_actions/servers/agent_memory";
import { default as agentRouterServer } from "@app/lib/actions/mcp_internal_actions/servers/agent_router";
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
import { default as imageGenerationDallEServer } from "@app/lib/actions/mcp_internal_actions/servers/image_generation";
import { default as includeDataServer } from "@app/lib/actions/mcp_internal_actions/servers/include";
import { default as interactiveContentServer } from "@app/lib/actions/mcp_internal_actions/servers/interactive_content";
import { default as jiraServer } from "@app/lib/actions/mcp_internal_actions/servers/jira";
import { default as jitTestingServer } from "@app/lib/actions/mcp_internal_actions/servers/jit_testing";
import { default as missingActionCatcherServer } from "@app/lib/actions/mcp_internal_actions/servers/missing_action_catcher";
import { default as mondayServer } from "@app/lib/actions/mcp_internal_actions/servers/monday";
import { default as notionServer } from "@app/lib/actions/mcp_internal_actions/servers/notion";
import { default as openaiUsageServer } from "@app/lib/actions/mcp_internal_actions/servers/openai_usage";
import { default as outlookServer } from "@app/lib/actions/mcp_internal_actions/servers/outlook";
import { default as outlookCalendarServer } from "@app/lib/actions/mcp_internal_actions/servers/outlook/calendar_server";
import { default as primitiveTypesDebuggerServer } from "@app/lib/actions/mcp_internal_actions/servers/primitive_types_debugger";
import { default as randomNumbersServer } from "@app/lib/actions/mcp_internal_actions/servers/random_numbers";
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
      return githubServer(auth);
    case "hubspot":
      return hubspotServer();
    case "image_generation":
      return imageGenerationDallEServer(auth);
    case "elevenlabs":
      return elevenlabsServer(auth);
    case "file_generation":
      return generateFileServer(auth);
    case "interactive_content":
      return interactiveContentServer(auth, agentLoopContext);
    case "query_tables_v2":
      return tablesQueryServerV2(auth, agentLoopContext);
    case "primitive_types_debugger":
      return primitiveTypesDebuggerServer(auth);
    case "jit_testing":
      return jitTestingServer(auth);
    case "random_numbers":
      return randomNumbersServer(auth, agentLoopContext);
    case "web_search_&_browse":
      return webtoolsServer(auth, agentLoopContext);
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
    case "openai_usage":
      return openaiUsageServer(auth, agentLoopContext);
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
      return salesforceServer(auth);
    case "gmail":
      return gmailServer(auth);
    case "google_calendar":
      return calendarServer(auth, agentLoopContext);
    case "google_drive":
      return driveServer(auth);
    case "google_sheets":
      return sheetsServer(auth);
    case "data_sources_file_system":
      return dataSourcesFileSystemServer(auth, agentLoopContext);
    case "conversation_files":
      return conversationFilesServer(auth, agentLoopContext);
    case "jira":
      return jiraServer(auth, agentLoopContext);
    case "monday":
      return mondayServer(auth);
    case "slack":
      return slackServer(auth, mcpServerId, agentLoopContext);
    case "slack_bot":
      return slackBotServer(auth, mcpServerId, agentLoopContext);
    case AGENT_MEMORY_SERVER_NAME:
      return agentMemoryServer(auth, agentLoopContext);
    case "confluence":
      return confluenceServer(auth);
    case "outlook":
      return outlookServer(auth);
    case "outlook_calendar":
      return outlookCalendarServer(auth);
    case "agent_management":
      return agentManagementServer(auth, agentLoopContext);
    case "freshservice":
      return freshserviceServer(auth);
    case "data_warehouses":
      return dataWarehousesServer(auth, agentLoopContext);
    case "toolsets":
      return toolsetsServer(auth, agentLoopContext);
    case "deep_dive":
      return deepDiveServer(auth, agentLoopContext);
    default:
      assertNever(internalMCPServerName);
  }
}
