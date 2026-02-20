import type { InternalMCPServerNameType } from "@app/lib/actions/mcp_internal_actions/constants";
import { ADVANCED_SEARCH_SWITCH } from "@app/lib/actions/mcp_internal_actions/constants";
import type { AgentLoopContextType } from "@app/lib/actions/types";
import {
  isLightServerSideMCPToolConfiguration,
  isServerSideMCPServerConfiguration,
} from "@app/lib/actions/types/guards";
import { default as agentCopilotAgentStateServer } from "@app/lib/api/actions/servers/agent_copilot_agent_state";
import { default as agentCopilotContextServer } from "@app/lib/api/actions/servers/agent_copilot_context";
import { default as agentManagementServer } from "@app/lib/api/actions/servers/agent_management";
import { default as agentMemoryServer } from "@app/lib/api/actions/servers/agent_memory";
import { default as agentRouterServer } from "@app/lib/api/actions/servers/agent_router";
import { default as ashbyServer } from "@app/lib/api/actions/servers/ashby";
import { default as commonUtilitiesServer } from "@app/lib/api/actions/servers/common_utilities";
import { default as confluenceServer } from "@app/lib/api/actions/servers/confluence";
import { default as conversationFilesServer } from "@app/lib/api/actions/servers/conversation_files";
import { default as dataSourcesFileSystemServer } from "@app/lib/api/actions/servers/data_sources_file_system";
import { default as dataWarehousesServer } from "@app/lib/api/actions/servers/data_warehouses";
import { default as databricksServer } from "@app/lib/api/actions/servers/databricks";
import { default as extractDataServer } from "@app/lib/api/actions/servers/extract_data";
import { default as fileGenerationServer } from "@app/lib/api/actions/servers/file_generation";
import { default as freshserviceServer } from "@app/lib/api/actions/servers/freshservice";
import { default as frontServer } from "@app/lib/api/actions/servers/front";
import { default as githubServer } from "@app/lib/api/actions/servers/github";
import { default as gmailServer } from "@app/lib/api/actions/servers/gmail";
import { default as calendarServer } from "@app/lib/api/actions/servers/google_calendar";
import { default as driveServer } from "@app/lib/api/actions/servers/google_drive";
import { default as sheetsServer } from "@app/lib/api/actions/servers/google_sheets";
import { default as httpClientServer } from "@app/lib/api/actions/servers/http_client";
import { default as hubspotServer } from "@app/lib/api/actions/servers/hubspot";
import { default as imageGenerationServer } from "@app/lib/api/actions/servers/image_generation";
import { default as includeDataServer } from "@app/lib/api/actions/servers/include_data";
import { default as interactiveContentServer } from "@app/lib/api/actions/servers/interactive_content";
import { default as jiraServer } from "@app/lib/api/actions/servers/jira";
import { default as jitTestingServer } from "@app/lib/api/actions/servers/jit_testing";
import { default as microsoftDriveServer } from "@app/lib/api/actions/servers/microsoft_drive";
import { default as microsoftExcelServer } from "@app/lib/api/actions/servers/microsoft_excel";
import { default as microsoftTeamsServer } from "@app/lib/api/actions/servers/microsoft_teams";
import { default as missingActionCatcherServer } from "@app/lib/api/actions/servers/missing_action_catcher";
import { default as mondayServer } from "@app/lib/api/actions/servers/monday";
import { default as notionServer } from "@app/lib/api/actions/servers/notion";
import { default as openaiUsageServer } from "@app/lib/api/actions/servers/openai_usage";
import { default as outlookCalendarServer } from "@app/lib/api/actions/servers/outlook/calendar_server";
import { default as outlookMailServer } from "@app/lib/api/actions/servers/outlook/mail_server";
import { default as primitiveTypesDebuggerServer } from "@app/lib/api/actions/servers/primitive_types_debugger";
import { default as productboardServer } from "@app/lib/api/actions/servers/productboard";
import { default as projectConversationServer } from "@app/lib/api/actions/servers/project_conversation";
import { default as projectManagerServer } from "@app/lib/api/actions/servers/project_manager";
import { default as tablesQueryServerV2 } from "@app/lib/api/actions/servers/query_tables_v2";
import { default as runAgentServer } from "@app/lib/api/actions/servers/run_agent";
import { default as dustAppServer } from "@app/lib/api/actions/servers/run_dust_app";
import { default as salesforceServer } from "@app/lib/api/actions/servers/salesforce";
import { default as salesloftServer } from "@app/lib/api/actions/servers/salesloft";
import { default as sandboxServer } from "@app/lib/api/actions/servers/sandbox";
import { default as schedulesManagementServer } from "@app/lib/api/actions/servers/schedules_management";
import { default as searchServer } from "@app/lib/api/actions/servers/search";
import { default as skillManagementServer } from "@app/lib/api/actions/servers/skill_management";
import { default as slabServer } from "@app/lib/api/actions/servers/slab";
import { default as slackBotServer } from "@app/lib/api/actions/servers/slack_bot";
import { default as slackServer } from "@app/lib/api/actions/servers/slack_personal";
import { default as slideshowServer } from "@app/lib/api/actions/servers/slideshow";
import { default as snowflakeServer } from "@app/lib/api/actions/servers/snowflake";
import { default as soundStudio } from "@app/lib/api/actions/servers/sound_studio";
import { default as speechGenerator } from "@app/lib/api/actions/servers/speech_generator";
import { default as statuspageServer } from "@app/lib/api/actions/servers/statuspage";
import { default as toolsetsServer } from "@app/lib/api/actions/servers/toolsets";
import { default as ukgReadyServer } from "@app/lib/api/actions/servers/ukg_ready";
import { default as userMentionsServer } from "@app/lib/api/actions/servers/user_mentions";
import { default as valtownServer } from "@app/lib/api/actions/servers/val_town";
import { default as vantaServer } from "@app/lib/api/actions/servers/vanta";
import { default as webSearchBrowseServer } from "@app/lib/api/actions/servers/web_search_browse";
import { default as zendeskServer } from "@app/lib/api/actions/servers/zendesk";
import type { Authenticator } from "@app/lib/auth";
import { assertNever } from "@app/types/shared/utils/assert_never";
import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";

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

// biome-ignore lint/suspicious/useAwait: ignored using `--suppress`
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
      return githubServer(auth, agentLoopContext);
    case "ashby":
      return ashbyServer(auth, agentLoopContext);
    case "hubspot":
      return hubspotServer(auth, agentLoopContext);
    case "image_generation":
      return imageGenerationServer(auth, agentLoopContext);
    case "speech_generator":
      return speechGenerator(auth, agentLoopContext);
    case "sound_studio":
      return soundStudio(auth, agentLoopContext);
    case "file_generation":
      return fileGenerationServer(auth, agentLoopContext);
    case "interactive_content":
      return interactiveContentServer(auth, agentLoopContext);
    case "query_tables_v2":
      return tablesQueryServerV2(auth, agentLoopContext);
    case "primitive_types_debugger":
      return primitiveTypesDebuggerServer(auth, agentLoopContext);
    case "jit_testing":
      return jitTestingServer(auth, agentLoopContext);
    case "common_utilities":
      return commonUtilitiesServer(auth, agentLoopContext);
    case "web_search_&_browse":
      return webSearchBrowseServer(auth, agentLoopContext);
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
    case "run_dust_app":
      return dustAppServer(auth, agentLoopContext);
    case "agent_router":
      return agentRouterServer(auth, agentLoopContext);
    case "extract_data":
      return extractDataServer(auth, agentLoopContext);
    case "salesforce":
      return salesforceServer(auth, agentLoopContext);
    case "salesloft":
      return salesloftServer(auth, agentLoopContext);
    case "slab":
      return slabServer(auth, agentLoopContext);
    case "snowflake":
      return snowflakeServer(auth, agentLoopContext);
    case "gmail":
      return gmailServer(auth, agentLoopContext);
    case "google_calendar":
      return calendarServer(auth, agentLoopContext);
    case "google_drive":
      return driveServer(auth, agentLoopContext);
    case "google_sheets":
      return sheetsServer(auth, agentLoopContext);
    case "data_sources_file_system":
      return dataSourcesFileSystemServer(auth, agentLoopContext);
    case "conversation_files":
      return conversationFilesServer(auth, agentLoopContext);
    case "databricks":
      return databricksServer(auth, agentLoopContext);
    case "jira":
      return jiraServer(auth, agentLoopContext);
    case "microsoft_drive":
      return microsoftDriveServer(auth, agentLoopContext);
    case "microsoft_excel":
      return microsoftExcelServer(auth, agentLoopContext);
    case "microsoft_teams":
      return microsoftTeamsServer(auth, agentLoopContext);
    case "monday":
      return mondayServer(auth, agentLoopContext);
    case "slack":
      return slackServer(auth, mcpServerId, agentLoopContext);
    case "slack_bot":
      return slackBotServer(auth, mcpServerId, agentLoopContext);
    case "agent_memory":
      return agentMemoryServer(auth, agentLoopContext);
    case "confluence":
      return confluenceServer(auth, agentLoopContext);
    case "outlook":
      return outlookMailServer(auth, agentLoopContext);
    case "outlook_calendar":
      return outlookCalendarServer(auth, agentLoopContext);
    case "agent_copilot_agent_state":
      return agentCopilotAgentStateServer(auth, agentLoopContext);
    case "agent_copilot_context":
      return agentCopilotContextServer(auth, agentLoopContext);
    case "agent_management":
      return agentManagementServer(auth, agentLoopContext);
    case "freshservice":
      return freshserviceServer(auth, agentLoopContext);
    case "data_warehouses":
      return dataWarehousesServer(auth, agentLoopContext);
    case "toolsets":
      return toolsetsServer(auth, agentLoopContext);
    case "val_town":
      return valtownServer(auth, agentLoopContext);
    case "vanta":
      return vantaServer(auth, agentLoopContext);
    case "http_client":
      return httpClientServer(auth, agentLoopContext);
    case "front":
      return frontServer(auth, agentLoopContext);
    case "zendesk":
      return zendeskServer(auth, agentLoopContext);
    case "skill_management":
      return skillManagementServer(auth, agentLoopContext);
    case "schedules_management":
      return schedulesManagementServer(auth, agentLoopContext);
    case "productboard":
      return productboardServer(auth, agentLoopContext);
    case "project_manager":
      return projectManagerServer(auth, agentLoopContext);
    case "project_conversation":
      return projectConversationServer(auth, agentLoopContext);
    case "ukg_ready":
      return ukgReadyServer(auth, agentLoopContext);
    case "user_mentions":
      return userMentionsServer(auth, agentLoopContext);
    case "statuspage":
      return statuspageServer(auth, agentLoopContext);
    case "sandbox":
      return sandboxServer(auth, agentLoopContext);
    default:
      assertNever(internalMCPServerName);
  }
}
