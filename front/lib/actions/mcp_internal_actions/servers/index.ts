import type { InternalMCPServerNameType } from "@app/lib/actions/mcp_internal_actions/constants";
import { ADVANCED_SEARCH_SWITCH } from "@app/lib/actions/mcp_internal_actions/constants";
import type { ToolContext } from "@app/lib/actions/types";
import {
  isLightServerSideMCPToolConfiguration,
  isServerSideMCPServerConfiguration,
} from "@app/lib/actions/types/guards";
import { default as activationRecommendationsServer } from "@app/lib/api/actions/servers/activation_recommendations";
import { default as agentDelegationServer } from "@app/lib/api/actions/servers/agent_delegation";
import { default as agentMemoryServer } from "@app/lib/api/actions/servers/agent_memory";
import { default as agentRouterServer } from "@app/lib/api/actions/servers/agent_router";
import { default as agentSidekickAgentStateServer } from "@app/lib/api/actions/servers/agent_sidekick_agent_state";
import { default as agentSidekickContextServer } from "@app/lib/api/actions/servers/agent_sidekick_context";
import { default as agentTemplatesServer } from "@app/lib/api/actions/servers/agent_templates";
import { default as ashbyServer } from "@app/lib/api/actions/servers/ashby";
import { default as askUserQuestionServer } from "@app/lib/api/actions/servers/ask_user_question";
import { default as clariCopilotServer } from "@app/lib/api/actions/servers/clari_copilot";
import { default as commonUtilitiesServer } from "@app/lib/api/actions/servers/common_utilities";
import { default as confluenceServer } from "@app/lib/api/actions/servers/confluence";
import { default as conversationFilesServer } from "@app/lib/api/actions/servers/conversation_files";
import { default as conversationSidePanelServer } from "@app/lib/api/actions/servers/conversation_side_panel";
import { default as dataSourcesFileSystemServer } from "@app/lib/api/actions/servers/data_sources_file_system";
import { default as dataWarehousesServer } from "@app/lib/api/actions/servers/data_warehouses";
import { default as exaServer } from "@app/lib/api/actions/servers/exa";
import { default as extractDataServer } from "@app/lib/api/actions/servers/extract_data";
import { default as fathomServer } from "@app/lib/api/actions/servers/fathom";
import { default as fileGenerationServer } from "@app/lib/api/actions/servers/file_generation";
import { default as filesServer } from "@app/lib/api/actions/servers/files";
import { default as freshserviceServer } from "@app/lib/api/actions/servers/freshservice";
import { default as frontServer } from "@app/lib/api/actions/servers/front";
import { default as githubServer } from "@app/lib/api/actions/servers/github";
import { default as gmailServer } from "@app/lib/api/actions/servers/gmail";
import { default as gongServer } from "@app/lib/api/actions/servers/gong";
import { default as calendarServer } from "@app/lib/api/actions/servers/google_calendar";
import { default as driveServer } from "@app/lib/api/actions/servers/google_drive";
import { default as sheetsServer } from "@app/lib/api/actions/servers/google_sheets";
import { default as httpClientServer } from "@app/lib/api/actions/servers/http_client";
import { default as hubspotServer } from "@app/lib/api/actions/servers/hubspot";
import { default as imageGenerationServer } from "@app/lib/api/actions/servers/image_generation";
import { default as includeDataServer } from "@app/lib/api/actions/servers/include_data";
import { default as interactiveContentServer } from "@app/lib/api/actions/servers/interactive_content";
import { default as jiraServer } from "@app/lib/api/actions/servers/jira";
import { default as lumaServer } from "@app/lib/api/actions/servers/luma";
import { default as microsoftDriveServer } from "@app/lib/api/actions/servers/microsoft_drive";
import { default as microsoftExcelServer } from "@app/lib/api/actions/servers/microsoft_excel";
import { default as microsoftTeamsServer } from "@app/lib/api/actions/servers/microsoft_teams";
import { default as missingActionCatcherServer } from "@app/lib/api/actions/servers/missing_action_catcher";
import { default as mondayServer } from "@app/lib/api/actions/servers/monday";
import { default as notionServer } from "@app/lib/api/actions/servers/notion";
import { default as openaiUsageServer } from "@app/lib/api/actions/servers/openai_usage";
import { default as outlookCalendarServer } from "@app/lib/api/actions/servers/outlook/calendar_server";
import { default as outlookMailServer } from "@app/lib/api/actions/servers/outlook/mail_server";
import { default as planModeServer } from "@app/lib/api/actions/servers/plan_mode";
import { default as podManagerServer } from "@app/lib/api/actions/servers/pod_manager";
import { default as podTasksServer } from "@app/lib/api/actions/servers/pod_tasks";
import { default as pokeServer } from "@app/lib/api/actions/servers/poke";
import { default as productboardServer } from "@app/lib/api/actions/servers/productboard";
import { default as tablesQueryServerV2 } from "@app/lib/api/actions/servers/query_tables_v2";
import { default as runAgentServer } from "@app/lib/api/actions/servers/run_agent";
import { default as dustAppServer } from "@app/lib/api/actions/servers/run_dust_app";
import { default as salesforceServer } from "@app/lib/api/actions/servers/salesforce";
import { default as salesloftServer } from "@app/lib/api/actions/servers/salesloft";
import { default as sandboxServer } from "@app/lib/api/actions/servers/sandbox";
import { default as sandboxFunctionsServer } from "@app/lib/api/actions/servers/sandbox_functions";
import { default as searchServer } from "@app/lib/api/actions/servers/search";
import { default as servicenowServer } from "@app/lib/api/actions/servers/servicenow";
import { default as shopifyServer } from "@app/lib/api/actions/servers/shopify";
import { default as skillAuthoringServer } from "@app/lib/api/actions/servers/skill_authoring";
import { default as skillManagementServer } from "@app/lib/api/actions/servers/skill_management";
import { default as slabServer } from "@app/lib/api/actions/servers/slab";
import { default as slackBotServer } from "@app/lib/api/actions/servers/slack_bot";
import { default as slackServer } from "@app/lib/api/actions/servers/slack_personal";
import { default as snowflakeServer } from "@app/lib/api/actions/servers/snowflake";
import { default as soundStudio } from "@app/lib/api/actions/servers/sound_studio";
import { default as speechGenerator } from "@app/lib/api/actions/servers/speech_generator";
import { default as statuspageServer } from "@app/lib/api/actions/servers/statuspage";
import { default as toolsetsServer } from "@app/lib/api/actions/servers/toolsets";
import { default as triggersManagementServer } from "@app/lib/api/actions/servers/triggers_management";
import { default as ukgReadyServer } from "@app/lib/api/actions/servers/ukg_ready";
import { default as userAnalyticsServer } from "@app/lib/api/actions/servers/user_analytics";
import { default as userMemoryServer } from "@app/lib/api/actions/servers/user_memory";
import { default as userMentionsServer } from "@app/lib/api/actions/servers/user_mentions";
import { default as valtownServer } from "@app/lib/api/actions/servers/val_town";
import { default as vantaServer } from "@app/lib/api/actions/servers/vanta";
import { default as wakeupsServer } from "@app/lib/api/actions/servers/wakeups";
import { default as webSearchBrowseServer } from "@app/lib/api/actions/servers/web_search_browse";
import { default as workspaceAnalyticsServer } from "@app/lib/api/actions/servers/workspace_analytics";
import { default as workspaceManagementServer } from "@app/lib/api/actions/servers/workspace_management";
import { default as zendeskServer } from "@app/lib/api/actions/servers/zendesk";
import type { Authenticator } from "@app/lib/auth";
import { assertNever } from "@app/types/shared/utils/assert_never";
import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";

/**
 * Check if we are in advanced search mode,
 * relying on a magic value stored in the additionalConfiguration.
 */
function isAdvancedSearchMode(toolContext?: ToolContext) {
  return (
    (toolContext?.runContext &&
      isLightServerSideMCPToolConfiguration(
        toolContext.runContext.toolConfiguration
      ) &&
      toolContext.runContext.toolConfiguration.additionalConfiguration[
        ADVANCED_SEARCH_SWITCH
        // eslint-disable-next-line @typescript-eslint/prefer-nullish-coalescing
      ] === true) ||
    (toolContext?.listToolsContext &&
      isServerSideMCPServerConfiguration(
        toolContext.listToolsContext.agentActionConfiguration
      ) &&
      toolContext.listToolsContext.agentActionConfiguration
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
  toolContext?: ToolContext
): Promise<McpServer> {
  switch (internalMCPServerName) {
    case "github":
      return githubServer(auth, toolContext);
    case "ashby":
      return ashbyServer(auth, toolContext);
    case "clari_copilot":
      return clariCopilotServer(auth, toolContext);
    case "hubspot":
      return hubspotServer(auth, toolContext);
    case "image_generation":
      return imageGenerationServer(auth, toolContext);
    case "speech_generator":
      return speechGenerator(auth, toolContext);
    case "sound_studio":
      return soundStudio(auth, toolContext);
    case "file_generation":
      return fileGenerationServer(auth, toolContext);
    case "interactive_content":
      return interactiveContentServer(auth, toolContext);
    case "query_tables_v2":
      return tablesQueryServerV2(auth, toolContext);
    case "common_utilities":
      return commonUtilitiesServer(auth, toolContext);
    case "web_search_&_browse":
      return webSearchBrowseServer(auth, toolContext);
    case "search":
      // If we are in advanced search mode, we use the data_sources_file_system server instead.
      if (isAdvancedSearchMode(toolContext)) {
        return dataSourcesFileSystemServer(auth, toolContext);
      }
      return searchServer(auth, toolContext);
    case "missing_action_catcher":
      return missingActionCatcherServer(auth, toolContext);
    case "notion":
      return notionServer(auth, toolContext);
    case "openai_usage":
      return openaiUsageServer(auth, toolContext);
    case "include_data":
      return includeDataServer(auth, toolContext);
    case "run_agent":
      return runAgentServer(auth, toolContext);
    case "agent_delegation":
      return agentDelegationServer(auth, toolContext);
    case "run_dust_app":
      return dustAppServer(auth, toolContext);
    case "agent_router":
      return agentRouterServer(auth, toolContext);
    case "extract_data":
      return extractDataServer(auth, toolContext);
    case "salesforce":
      return salesforceServer(auth, toolContext);
    case "salesloft":
      return salesloftServer(auth, toolContext);
    case "slab":
      return slabServer(auth, toolContext);
    case "snowflake":
      return snowflakeServer(auth, toolContext);
    case "gmail":
      return gmailServer(auth, toolContext);
    case "gong":
      return gongServer(auth, toolContext);
    case "google_calendar":
      return calendarServer(auth, toolContext);
    case "google_drive":
      return driveServer(auth, toolContext);
    case "google_sheets":
      return sheetsServer(auth, toolContext);
    case "data_sources_file_system":
      return dataSourcesFileSystemServer(auth, toolContext);
    case "conversation_files":
      return conversationFilesServer(auth, toolContext);
    case "conversation_side_panel":
      return conversationSidePanelServer(auth, toolContext);
    case "files":
      return filesServer(auth, toolContext);
    case "servicenow":
      return servicenowServer(auth, toolContext);
    case "shopify":
      return shopifyServer(auth, toolContext);
    case "jira":
      return jiraServer(auth, toolContext);
    case "luma":
      return lumaServer(auth, toolContext);
    case "microsoft_drive":
      return microsoftDriveServer(auth, toolContext);
    case "microsoft_excel":
      return microsoftExcelServer(auth, toolContext);
    case "microsoft_teams":
      return microsoftTeamsServer(auth, toolContext);
    case "monday":
      return mondayServer(auth, toolContext);
    case "slack":
      return slackServer(auth, mcpServerId, toolContext);
    case "slack_bot":
      return slackBotServer(auth, mcpServerId, toolContext);
    case "agent_memory":
      return agentMemoryServer(auth, toolContext);
    case "confluence":
      return confluenceServer(auth, toolContext);
    case "outlook":
      return outlookMailServer(auth, toolContext);
    case "outlook_calendar":
      return outlookCalendarServer(auth, toolContext);
    case "agent_sidekick_agent_state":
      return agentSidekickAgentStateServer(auth, toolContext);
    case "agent_sidekick_context":
      return agentSidekickContextServer(auth, toolContext);
    case "agent_templates":
      return agentTemplatesServer(auth, toolContext);
    case "exa_people_and_company":
      return exaServer(auth, toolContext);
    case "fathom":
      return fathomServer(auth, toolContext);
    case "freshservice":
      return freshserviceServer(auth, toolContext);
    case "data_warehouses":
      return dataWarehousesServer(auth, toolContext);
    case "toolsets":
      return toolsetsServer(auth, toolContext);
    case "val_town":
      return valtownServer(auth, toolContext);
    case "vanta":
      return vantaServer(auth, toolContext);
    case "http_client":
      return httpClientServer(auth, toolContext);
    case "front":
      return frontServer(auth, toolContext);
    case "zendesk":
      return zendeskServer(auth, toolContext);
    case "workspace_analytics":
      return workspaceAnalyticsServer(auth, toolContext);
    case "workspace_management":
      return workspaceManagementServer(auth, toolContext);
    case "skill_management":
      return skillManagementServer(auth, toolContext);
    case "skill_authoring":
      return skillAuthoringServer(auth, toolContext);
    case "triggers_management":
      return triggersManagementServer(auth, toolContext);
    case "productboard":
      return productboardServer(auth, toolContext);
    case "pod_manager":
      return podManagerServer(auth, toolContext);
    case "pod_tasks":
      return podTasksServer(auth, toolContext);
    case "poke":
      return pokeServer(auth, toolContext);
    case "ask_user_question":
      return askUserQuestionServer(auth, toolContext);
    case "ukg_ready":
      return ukgReadyServer(auth, toolContext);
    case "user_mentions":
      return userMentionsServer(auth, toolContext);
    case "statuspage":
      return statuspageServer(auth, toolContext);
    case "sandbox":
      return sandboxServer(auth, toolContext);
    case "sandbox_functions":
      return sandboxFunctionsServer(auth, toolContext);
    case "wakeups":
      return wakeupsServer(auth, toolContext);
    case "plan_mode":
      return planModeServer(auth, toolContext);
    case "user_analytics":
      return userAnalyticsServer(auth, toolContext);
    case "user_memory":
      return userMemoryServer(auth, toolContext);
    case "activation_recommendations":
      return activationRecommendationsServer(auth, toolContext);
    default:
      assertNever(internalMCPServerName);
  }
}
