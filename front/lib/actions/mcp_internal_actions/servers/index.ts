import {
  ADVANCED_SEARCH_SWITCH,
  INTERNAL_MCP_SERVERS,
  type InternalMCPServerNameType,
} from "@app/lib/actions/mcp_internal_actions/constants";
import type {
  ServerMetadata,
  ToolDefinition,
  ToolHandlers,
  ToolMeta,
} from "@app/lib/actions/mcp_internal_actions/tool_definition";
import { shouldAutoGenerateTags } from "@app/lib/actions/mcp_internal_actions/tools/tags/utils";
import { registerTool } from "@app/lib/actions/mcp_internal_actions/wrappers";
import type { ToolContext } from "@app/lib/actions/types";
import {
  isLightServerSideMCPToolConfiguration,
  isServerSideMCPServerConfiguration,
} from "@app/lib/actions/types/guards";
import { ACTIVATION_RECOMMENDATIONS_TOOL_HANDLERS } from "@app/lib/api/actions/servers/activation_recommendations";
import { AGENT_MEMORY_TOOL_HANDLERS } from "@app/lib/api/actions/servers/agent_memory/tools";
import { AGENT_ROUTER_TOOL_HANDLERS } from "@app/lib/api/actions/servers/agent_router/tools";
import { AGENT_SIDEKICK_AGENT_STATE_TOOL_HANDLERS } from "@app/lib/api/actions/servers/agent_sidekick_agent_state/tools";
import { AGENT_SIDEKICK_CONTEXT_TOOL_HANDLERS } from "@app/lib/api/actions/servers/agent_sidekick_context/tools";
import { AGENT_TEMPLATES_TOOL_HANDLERS } from "@app/lib/api/actions/servers/agent_templates";
import { ASHBY_TOOL_HANDLERS } from "@app/lib/api/actions/servers/ashby/tools";
import { ASK_USER_QUESTION_TOOL_HANDLERS } from "@app/lib/api/actions/servers/ask_user_question/tools";
import { CLARI_COPILOT_TOOL_HANDLERS } from "@app/lib/api/actions/servers/clari_copilot/tools";
import { COMMON_UTILITIES_TOOL_HANDLERS } from "@app/lib/api/actions/servers/common_utilities/tools";
import { CONFLUENCE_TOOL_HANDLERS } from "@app/lib/api/actions/servers/confluence/tools";
import { CONVERSATION_FILES_TOOL_HANDLERS } from "@app/lib/api/actions/servers/conversation_files/tools";
import { DATA_SOURCES_FILE_SYSTEM_TOOLS_WITH_TAGS_METADATA } from "@app/lib/api/actions/servers/data_sources_file_system/metadata";
import {
  DATA_SOURCES_FILE_SYSTEM_TOOL_HANDLERS,
  DATA_SOURCES_FILE_SYSTEM_TOOL_HANDLERS_WITH_TAGS,
} from "@app/lib/api/actions/servers/data_sources_file_system/tools";
import { DATA_WAREHOUSES_TOOL_HANDLERS } from "@app/lib/api/actions/servers/data_warehouses/tools";
import { DATABRICKS_TOOL_HANDLERS } from "@app/lib/api/actions/servers/databricks/tools";
import { EXA_TOOL_HANDLERS } from "@app/lib/api/actions/servers/exa/tools";
import { createExtractDataTools } from "@app/lib/api/actions/servers/extract_data/tools";
import { FATHOM_TOOL_HANDLERS } from "@app/lib/api/actions/servers/fathom/tools";
import { FILE_GENERATION_TOOL_HANDLERS } from "@app/lib/api/actions/servers/file_generation/tools";
import { FILES_TOOL_HANDLERS } from "@app/lib/api/actions/servers/files/tools";
import { FRESHSERVICE_TOOL_HANDLERS } from "@app/lib/api/actions/servers/freshservice/tools";
import { FRONT_TOOL_HANDLERS } from "@app/lib/api/actions/servers/front/tools";
import { GITHUB_TOOL_HANDLERS } from "@app/lib/api/actions/servers/github/tools";
import { GMAIL_TOOL_HANDLERS } from "@app/lib/api/actions/servers/gmail/tools";
import { GONG_TOOL_HANDLERS } from "@app/lib/api/actions/servers/gong/tools";
import { GOOGLE_CALENDAR_TOOL_HANDLERS } from "@app/lib/api/actions/servers/google_calendar/tools";
import { GOOGLE_DRIVE_TOOL_HANDLERS } from "@app/lib/api/actions/servers/google_drive/tools";
import { GOOGLE_SHEETS_TOOL_HANDLERS } from "@app/lib/api/actions/servers/google_sheets/tools";
import { HTTP_CLIENT_TOOLS_METADATA } from "@app/lib/api/actions/servers/http_client/metadata";
import { HTTP_CLIENT_TOOL_HANDLERS } from "@app/lib/api/actions/servers/http_client/tools";
import { HUBSPOT_TOOL_HANDLERS } from "@app/lib/api/actions/servers/hubspot/tools";
import { createImageGenerationToolHandlers } from "@app/lib/api/actions/servers/image_generation/tools";
import { createIncludeDataTools } from "@app/lib/api/actions/servers/include_data/tools";
import { createInteractiveContentToolHandlers } from "@app/lib/api/actions/servers/interactive_content/tools";
import { JIRA_TOOL_HANDLERS } from "@app/lib/api/actions/servers/jira/tools";
import { JIT_TESTING_TOOL_HANDLERS } from "@app/lib/api/actions/servers/jit_testing/tools";
import { createLumaToolHandlers } from "@app/lib/api/actions/servers/luma/tools";
import { MICROSOFT_DRIVE_TOOL_HANDLERS } from "@app/lib/api/actions/servers/microsoft_drive/tools";
import { MICROSOFT_EXCEL_TOOL_HANDLERS } from "@app/lib/api/actions/servers/microsoft_excel/tools";
import { MICROSOFT_TEAMS_TOOL_HANDLERS } from "@app/lib/api/actions/servers/microsoft_teams/tools";
import { createMissingActionCatcherTools } from "@app/lib/api/actions/servers/missing_action_catcher/tools";
import { MONDAY_TOOL_HANDLERS } from "@app/lib/api/actions/servers/monday/tools";
import { createNotionToolHandlers } from "@app/lib/api/actions/servers/notion/tools";
import { createOpenAIUsageToolHandlers } from "@app/lib/api/actions/servers/openai_usage/tools";
import { OUTLOOK_CALENDAR_TOOL_HANDLERS } from "@app/lib/api/actions/servers/outlook/tools/calendar";
import { OUTLOOK_TOOL_HANDLERS } from "@app/lib/api/actions/servers/outlook/tools/mail";
import { PLAN_MODE_TOOL_HANDLERS } from "@app/lib/api/actions/servers/plan_mode/tools";
import { createProjectManagerToolHandlers } from "@app/lib/api/actions/servers/pod_manager/tools";
import { createProjectTasksToolHandlers } from "@app/lib/api/actions/servers/pod_tasks/tools";
import { POKE_TOOL_HANDLERS } from "@app/lib/api/actions/servers/poke/tools";
import { PRIMITIVE_TYPES_DEBUGGER_TOOL_HANDLERS } from "@app/lib/api/actions/servers/primitive_types_debugger/tools";
import { createProductboardToolHandlers } from "@app/lib/api/actions/servers/productboard/tools";
import { QUERY_TABLES_V2_TOOL_HANDLERS } from "@app/lib/api/actions/servers/query_tables_v2/tools";
import { createRunAgentTools } from "@app/lib/api/actions/servers/run_agent";
import { createRunDustAppTools } from "@app/lib/api/actions/servers/run_dust_app";
import { createSalesforceToolHandlers } from "@app/lib/api/actions/servers/salesforce/tools";
import { createSalesloftToolHandlers } from "@app/lib/api/actions/servers/salesloft/tools";
import {
  getAvailableSandboxToolsMetadata,
  SANDBOX_TOOL_HANDLERS,
} from "@app/lib/api/actions/servers/sandbox/tools";
import { SANDBOX_FUNCTIONS_TOOL_HANDLERS } from "@app/lib/api/actions/servers/sandbox_functions/tools";
import { createSchedulesManagementToolHandlers } from "@app/lib/api/actions/servers/schedules_management/tools";
import { SEARCH_TOOL_METADATA_WITH_TAGS } from "@app/lib/api/actions/servers/search/metadata";
import {
  SEARCH_TOOL_HANDLERS,
  SEARCH_TOOL_HANDLERS_WITH_TAGS,
} from "@app/lib/api/actions/servers/search/tools";
import { SKILL_AUTHORING_TOOL_HANDLERS } from "@app/lib/api/actions/servers/skill_authoring/tools";
import { SKILL_MANAGEMENT_TOOL_HANDLERS } from "@app/lib/api/actions/servers/skill_management/tools";
import { SLAB_TOOL_HANDLERS } from "@app/lib/api/actions/servers/slab/tools";
import { createSlackBotToolHandlers } from "@app/lib/api/actions/servers/slack_bot/tools";
import { createSlackPersonalToolsForContext } from "@app/lib/api/actions/servers/slack_personal";
import { SNOWFLAKE_TOOL_HANDLERS } from "@app/lib/api/actions/servers/snowflake/tools";
import { SOUND_STUDIO_TOOL_HANDLERS } from "@app/lib/api/actions/servers/sound_studio/tools";
import { SPEECH_GENERATOR_TOOL_HANDLERS } from "@app/lib/api/actions/servers/speech_generator/tools";
import { createStatuspageToolHandlers } from "@app/lib/api/actions/servers/statuspage/tools";
import { TOOLSETS_TOOL_HANDLERS } from "@app/lib/api/actions/servers/toolsets/tools";
import { UKG_READY_TOOL_HANDLERS } from "@app/lib/api/actions/servers/ukg_ready/tools";
import { USER_ANALYTICS_TOOL_HANDLERS } from "@app/lib/api/actions/servers/user_analytics";
import { USER_MENTIONS_TOOL_HANDLERS } from "@app/lib/api/actions/servers/user_mentions/tools";
import { createValTownToolHandlers } from "@app/lib/api/actions/servers/val_town/tools";
import { VANTA_TOOL_HANDLERS } from "@app/lib/api/actions/servers/vanta/tools";
import { createWakeupsToolHandlers } from "@app/lib/api/actions/servers/wakeups/tools";
import { WEB_SEARCH_BROWSE_TOOLS_METADATA } from "@app/lib/api/actions/servers/web_search_browse/metadata";
import { WEB_SEARCH_BROWSE_TOOL_HANDLERS } from "@app/lib/api/actions/servers/web_search_browse/tools";
import { WORKDAY_TOOL_HANDLERS } from "@app/lib/api/actions/servers/workday/tools";
import { WORKSPACE_ANALYTICS_TOOL_HANDLERS } from "@app/lib/api/actions/servers/workspace_analytics/tools";
import { ZENDESK_TOOL_HANDLERS } from "@app/lib/api/actions/servers/zendesk/tools";
import type { Authenticator } from "@app/lib/auth";
import { assertNever } from "@app/types/shared/utils/assert_never";
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";

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

function createServer<
  ToolName extends string,
  T extends readonly ToolMeta<ToolName>[],
>(
  auth: Authenticator,
  {
    serverMetadata,
    toolContext,
    monitoringName = "server",
    ...options
  }: {
    serverMetadata: ServerMetadata & { tools: T };
    toolContext: ToolContext | undefined;
    monitoringName?: "server" | "tool";
  } & (
    | {
        toolHandlers: ToolHandlers<T, ToolName>;
        tools?: never;
      }
    | {
        toolHandlers?: never;
        tools: readonly ToolDefinition[];
      }
  )
) {
  const { serverInfo, tools } = serverMetadata;

  const server = new McpServer(serverInfo);

  if (options.tools !== undefined) {
    for (const tool of options.tools) {
      registerTool(auth, toolContext, server, tool, {
        monitoringName: monitoringName === "tool" ? tool.name : serverInfo.name,
      });
    }
    return server;
  }

  for (const tool of tools) {
    if (tool.isAvailableForContext?.({ auth, toolContext }) === false) {
      continue;
    }

    registerTool(
      auth,
      toolContext,
      server,
      {
        ...tool,
        handler: options.toolHandlers[tool.name],
      },
      {
        monitoringName: monitoringName === "tool" ? tool.name : serverInfo.name,
      }
    );
  }

  return server;
}

function createDataSourcesFileSystemServer(
  auth: Authenticator,
  toolContext: ToolContext | undefined
) {
  const serverMetadata = INTERNAL_MCP_SERVERS.data_sources_file_system.metadata;

  if (toolContext && shouldAutoGenerateTags(toolContext)) {
    return createServer(auth, {
      serverMetadata: {
        ...serverMetadata,
        tools: DATA_SOURCES_FILE_SYSTEM_TOOLS_WITH_TAGS_METADATA,
      },
      toolHandlers: DATA_SOURCES_FILE_SYSTEM_TOOL_HANDLERS_WITH_TAGS,
      toolContext,
      monitoringName: "tool",
    });
  }

  return createServer(auth, {
    serverMetadata,
    toolHandlers: DATA_SOURCES_FILE_SYSTEM_TOOL_HANDLERS,
    toolContext,
    monitoringName: "tool",
  });
}

function createSearchServer(
  auth: Authenticator,
  toolContext: ToolContext | undefined
) {
  const serverMetadata = INTERNAL_MCP_SERVERS.search.metadata;

  if (toolContext && shouldAutoGenerateTags(toolContext)) {
    return createServer(auth, {
      serverMetadata: {
        ...serverMetadata,
        tools: SEARCH_TOOL_METADATA_WITH_TAGS,
      },
      toolHandlers: SEARCH_TOOL_HANDLERS_WITH_TAGS,
      toolContext,
    });
  }

  return createServer(auth, {
    serverMetadata,
    toolHandlers: SEARCH_TOOL_HANDLERS,
    toolContext,
  });
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
      return createServer(auth, {
        serverMetadata: INTERNAL_MCP_SERVERS[internalMCPServerName].metadata,
        toolHandlers: GITHUB_TOOL_HANDLERS,
        toolContext,
      });
    case "ashby":
      return createServer(auth, {
        serverMetadata: INTERNAL_MCP_SERVERS[internalMCPServerName].metadata,
        toolHandlers: ASHBY_TOOL_HANDLERS,
        toolContext,
      });
    case "clari_copilot":
      return createServer(auth, {
        serverMetadata: INTERNAL_MCP_SERVERS[internalMCPServerName].metadata,
        toolHandlers: CLARI_COPILOT_TOOL_HANDLERS,
        toolContext,
      });
    case "hubspot":
      return createServer(auth, {
        serverMetadata: INTERNAL_MCP_SERVERS[internalMCPServerName].metadata,
        toolHandlers: HUBSPOT_TOOL_HANDLERS,
        toolContext,
      });
    case "image_generation":
      return createServer(auth, {
        serverMetadata: INTERNAL_MCP_SERVERS[internalMCPServerName].metadata,
        toolHandlers: createImageGenerationToolHandlers(auth, toolContext),
        toolContext,
      });
    case "speech_generator":
      return createServer(auth, {
        serverMetadata: INTERNAL_MCP_SERVERS[internalMCPServerName].metadata,
        toolHandlers: SPEECH_GENERATOR_TOOL_HANDLERS,
        toolContext,
      });
    case "sound_studio":
      return createServer(auth, {
        serverMetadata: INTERNAL_MCP_SERVERS[internalMCPServerName].metadata,
        toolHandlers: SOUND_STUDIO_TOOL_HANDLERS,
        toolContext,
      });
    case "file_generation":
      return createServer(auth, {
        serverMetadata: INTERNAL_MCP_SERVERS[internalMCPServerName].metadata,
        toolHandlers: FILE_GENERATION_TOOL_HANDLERS,
        toolContext,
      });
    case "interactive_content":
      return createServer(auth, {
        serverMetadata: INTERNAL_MCP_SERVERS[internalMCPServerName].metadata,
        toolHandlers: createInteractiveContentToolHandlers(auth, toolContext),
        toolContext,
      });
    case "query_tables_v2":
      return createServer(auth, {
        serverMetadata: INTERNAL_MCP_SERVERS[internalMCPServerName].metadata,
        toolHandlers: QUERY_TABLES_V2_TOOL_HANDLERS,
        toolContext,
      });
    case "primitive_types_debugger":
      return createServer(auth, {
        serverMetadata: INTERNAL_MCP_SERVERS[internalMCPServerName].metadata,
        toolHandlers: PRIMITIVE_TYPES_DEBUGGER_TOOL_HANDLERS,
        toolContext,
      });
    case "jit_testing":
      return createServer(auth, {
        serverMetadata: INTERNAL_MCP_SERVERS[internalMCPServerName].metadata,
        toolHandlers: JIT_TESTING_TOOL_HANDLERS,
        toolContext,
      });
    case "common_utilities":
      return createServer(auth, {
        serverMetadata: INTERNAL_MCP_SERVERS[internalMCPServerName].metadata,
        toolHandlers: COMMON_UTILITIES_TOOL_HANDLERS,
        toolContext,
      });
    case "web_search_&_browse":
      return createServer(auth, {
        serverMetadata: INTERNAL_MCP_SERVERS[internalMCPServerName].metadata,
        toolHandlers: WEB_SEARCH_BROWSE_TOOL_HANDLERS,
        toolContext,
      });
    case "search":
      // If we are in advanced search mode, we use the data_sources_file_system server instead.
      if (isAdvancedSearchMode(toolContext)) {
        return createDataSourcesFileSystemServer(auth, toolContext);
      }
      return createSearchServer(auth, toolContext);
    case "missing_action_catcher":
      return createServer(auth, {
        serverMetadata: INTERNAL_MCP_SERVERS[internalMCPServerName].metadata,
        tools: createMissingActionCatcherTools(toolContext),
        toolContext,
      });
    case "notion":
      return createServer(auth, {
        serverMetadata: INTERNAL_MCP_SERVERS[internalMCPServerName].metadata,
        toolHandlers: createNotionToolHandlers(toolContext),
        toolContext,
      });
    case "openai_usage":
      return createServer(auth, {
        serverMetadata: INTERNAL_MCP_SERVERS[internalMCPServerName].metadata,
        toolHandlers: createOpenAIUsageToolHandlers(auth, toolContext),
        toolContext,
      });
    case "include_data": {
      return createServer(auth, {
        serverMetadata: INTERNAL_MCP_SERVERS[internalMCPServerName].metadata,
        tools: createIncludeDataTools(auth, toolContext),
        toolContext,
      });
    }
    case "run_agent":
      return createServer(auth, {
        serverMetadata: INTERNAL_MCP_SERVERS[internalMCPServerName].metadata,
        tools: await createRunAgentTools(auth, toolContext),
        toolContext,
      });
    case "run_dust_app":
      return createServer(auth, {
        serverMetadata: INTERNAL_MCP_SERVERS[internalMCPServerName].metadata,
        tools: await createRunDustAppTools(auth, toolContext),
        toolContext,
      });
    case "agent_router":
      return createServer(auth, {
        serverMetadata: INTERNAL_MCP_SERVERS[internalMCPServerName].metadata,
        toolHandlers: AGENT_ROUTER_TOOL_HANDLERS,
        toolContext,
      });
    case "extract_data": {
      return createServer(auth, {
        serverMetadata: INTERNAL_MCP_SERVERS[internalMCPServerName].metadata,
        tools: createExtractDataTools(auth, toolContext),
        toolContext,
      });
    }
    case "salesforce":
      return createServer(auth, {
        serverMetadata: INTERNAL_MCP_SERVERS[internalMCPServerName].metadata,
        toolHandlers: createSalesforceToolHandlers(auth),
        toolContext,
      });
    case "salesloft":
      return createServer(auth, {
        serverMetadata: INTERNAL_MCP_SERVERS[internalMCPServerName].metadata,
        toolHandlers: createSalesloftToolHandlers(auth, toolContext),
        toolContext,
      });
    case "slab":
      return createServer(auth, {
        serverMetadata: INTERNAL_MCP_SERVERS[internalMCPServerName].metadata,
        toolHandlers: SLAB_TOOL_HANDLERS,
        toolContext,
      });
    case "snowflake":
      return createServer(auth, {
        serverMetadata: INTERNAL_MCP_SERVERS[internalMCPServerName].metadata,
        toolHandlers: SNOWFLAKE_TOOL_HANDLERS,
        toolContext,
      });
    case "gmail":
      return createServer(auth, {
        serverMetadata: INTERNAL_MCP_SERVERS[internalMCPServerName].metadata,
        toolHandlers: GMAIL_TOOL_HANDLERS,
        toolContext,
      });
    case "gong":
      return createServer(auth, {
        serverMetadata: INTERNAL_MCP_SERVERS[internalMCPServerName].metadata,
        toolHandlers: GONG_TOOL_HANDLERS,
        toolContext,
      });
    case "google_calendar":
      return createServer(auth, {
        serverMetadata: INTERNAL_MCP_SERVERS[internalMCPServerName].metadata,
        toolHandlers: GOOGLE_CALENDAR_TOOL_HANDLERS,
        toolContext,
      });
    case "google_drive":
      return createServer(auth, {
        serverMetadata: INTERNAL_MCP_SERVERS[internalMCPServerName].metadata,
        toolHandlers: GOOGLE_DRIVE_TOOL_HANDLERS,
        toolContext,
      });
    case "google_sheets":
      return createServer(auth, {
        serverMetadata: INTERNAL_MCP_SERVERS[internalMCPServerName].metadata,
        toolHandlers: GOOGLE_SHEETS_TOOL_HANDLERS,
        toolContext,
      });
    case "data_sources_file_system":
      return createDataSourcesFileSystemServer(auth, toolContext);
    case "conversation_files":
      return createServer(auth, {
        serverMetadata: INTERNAL_MCP_SERVERS[internalMCPServerName].metadata,
        toolHandlers: CONVERSATION_FILES_TOOL_HANDLERS,
        toolContext,
      });
    case "files":
      return createServer(auth, {
        serverMetadata: INTERNAL_MCP_SERVERS[internalMCPServerName].metadata,
        toolHandlers: FILES_TOOL_HANDLERS,
        toolContext,
      });
    case "databricks":
      return createServer(auth, {
        serverMetadata: INTERNAL_MCP_SERVERS[internalMCPServerName].metadata,
        toolHandlers: DATABRICKS_TOOL_HANDLERS,
        toolContext,
      });
    case "jira":
      return createServer(auth, {
        serverMetadata: INTERNAL_MCP_SERVERS[internalMCPServerName].metadata,
        toolHandlers: JIRA_TOOL_HANDLERS,
        toolContext,
      });
    case "luma":
      return createServer(auth, {
        serverMetadata: INTERNAL_MCP_SERVERS[internalMCPServerName].metadata,
        toolHandlers: createLumaToolHandlers(auth, toolContext),
        toolContext,
      });
    case "microsoft_drive":
      return createServer(auth, {
        serverMetadata: INTERNAL_MCP_SERVERS[internalMCPServerName].metadata,
        toolHandlers: MICROSOFT_DRIVE_TOOL_HANDLERS,
        toolContext,
      });
    case "microsoft_excel":
      return createServer(auth, {
        serverMetadata: INTERNAL_MCP_SERVERS[internalMCPServerName].metadata,
        toolHandlers: MICROSOFT_EXCEL_TOOL_HANDLERS,
        toolContext,
      });
    case "microsoft_teams":
      return createServer(auth, {
        serverMetadata: INTERNAL_MCP_SERVERS[internalMCPServerName].metadata,
        toolHandlers: MICROSOFT_TEAMS_TOOL_HANDLERS,
        toolContext,
      });
    case "monday":
      return createServer(auth, {
        serverMetadata: INTERNAL_MCP_SERVERS[internalMCPServerName].metadata,
        toolHandlers: MONDAY_TOOL_HANDLERS,
        toolContext,
      });
    case "slack":
      return createServer(auth, {
        serverMetadata: INTERNAL_MCP_SERVERS[internalMCPServerName].metadata,
        tools: await createSlackPersonalToolsForContext(
          auth,
          mcpServerId,
          toolContext
        ),
        toolContext,
      });
    case "slack_bot":
      return createServer(auth, {
        serverMetadata: INTERNAL_MCP_SERVERS[internalMCPServerName].metadata,
        toolHandlers: createSlackBotToolHandlers(
          auth,
          mcpServerId,
          toolContext
        ),
        toolContext,
      });
    case "agent_memory":
      return createServer(auth, {
        serverMetadata: INTERNAL_MCP_SERVERS[internalMCPServerName].metadata,
        toolHandlers: AGENT_MEMORY_TOOL_HANDLERS,
        toolContext,
      });
    case "confluence":
      return createServer(auth, {
        serverMetadata: INTERNAL_MCP_SERVERS[internalMCPServerName].metadata,
        toolHandlers: CONFLUENCE_TOOL_HANDLERS,
        toolContext,
      });
    case "outlook":
      return createServer(auth, {
        serverMetadata: INTERNAL_MCP_SERVERS[internalMCPServerName].metadata,
        toolHandlers: OUTLOOK_TOOL_HANDLERS,
        toolContext,
      });
    case "outlook_calendar":
      return createServer(auth, {
        serverMetadata: INTERNAL_MCP_SERVERS[internalMCPServerName].metadata,
        toolHandlers: OUTLOOK_CALENDAR_TOOL_HANDLERS,
        toolContext,
      });
    case "agent_sidekick_agent_state":
      return createServer(auth, {
        serverMetadata: INTERNAL_MCP_SERVERS[internalMCPServerName].metadata,
        toolHandlers: AGENT_SIDEKICK_AGENT_STATE_TOOL_HANDLERS,
        toolContext,
      });
    case "agent_sidekick_context":
      return createServer(auth, {
        serverMetadata: INTERNAL_MCP_SERVERS[internalMCPServerName].metadata,
        toolHandlers: AGENT_SIDEKICK_CONTEXT_TOOL_HANDLERS,
        toolContext,
      });
    case "agent_templates":
      return createServer(auth, {
        serverMetadata: INTERNAL_MCP_SERVERS[internalMCPServerName].metadata,
        toolHandlers: AGENT_TEMPLATES_TOOL_HANDLERS,
        toolContext,
      });
    case "exa_people_and_company":
      return createServer(auth, {
        serverMetadata: INTERNAL_MCP_SERVERS[internalMCPServerName].metadata,
        toolHandlers: EXA_TOOL_HANDLERS,
        toolContext,
      });
    case "fathom":
      return createServer(auth, {
        serverMetadata: INTERNAL_MCP_SERVERS[internalMCPServerName].metadata,
        toolHandlers: FATHOM_TOOL_HANDLERS,
        toolContext,
      });
    case "freshservice":
      return createServer(auth, {
        serverMetadata: INTERNAL_MCP_SERVERS[internalMCPServerName].metadata,
        toolHandlers: FRESHSERVICE_TOOL_HANDLERS,
        toolContext,
      });
    case "data_warehouses":
      return createServer(auth, {
        serverMetadata: INTERNAL_MCP_SERVERS[internalMCPServerName].metadata,
        toolHandlers: DATA_WAREHOUSES_TOOL_HANDLERS,
        toolContext,
      });
    case "toolsets":
      return createServer(auth, {
        serverMetadata: INTERNAL_MCP_SERVERS[internalMCPServerName].metadata,
        toolHandlers: TOOLSETS_TOOL_HANDLERS,
        toolContext,
      });
    case "val_town":
      return createServer(auth, {
        serverMetadata: INTERNAL_MCP_SERVERS[internalMCPServerName].metadata,
        toolHandlers: createValTownToolHandlers(auth, toolContext),
        toolContext,
      });
    case "vanta":
      return createServer(auth, {
        serverMetadata: INTERNAL_MCP_SERVERS[internalMCPServerName].metadata,
        toolHandlers: VANTA_TOOL_HANDLERS,
        toolContext,
      });
    case "http_client":
      return createServer(auth, {
        serverMetadata: {
          ...INTERNAL_MCP_SERVERS[internalMCPServerName].metadata,
          tools: [
            ...HTTP_CLIENT_TOOLS_METADATA,
            ...WEB_SEARCH_BROWSE_TOOLS_METADATA,
          ],
        },
        toolHandlers: {
          ...HTTP_CLIENT_TOOL_HANDLERS,
          ...WEB_SEARCH_BROWSE_TOOL_HANDLERS,
        },
        toolContext,
      });
    case "front":
      return createServer(auth, {
        serverMetadata: INTERNAL_MCP_SERVERS[internalMCPServerName].metadata,
        toolHandlers: FRONT_TOOL_HANDLERS,
        toolContext,
      });
    case "zendesk":
      return createServer(auth, {
        serverMetadata: INTERNAL_MCP_SERVERS[internalMCPServerName].metadata,
        toolHandlers: ZENDESK_TOOL_HANDLERS,
        toolContext,
      });
    case "workspace_analytics":
      return createServer(auth, {
        serverMetadata: INTERNAL_MCP_SERVERS[internalMCPServerName].metadata,
        toolHandlers: WORKSPACE_ANALYTICS_TOOL_HANDLERS,
        toolContext,
      });
    case "skill_management":
      return createServer(auth, {
        serverMetadata: INTERNAL_MCP_SERVERS[internalMCPServerName].metadata,
        toolHandlers: SKILL_MANAGEMENT_TOOL_HANDLERS,
        toolContext,
      });
    case "skill_authoring":
      return createServer(auth, {
        serverMetadata: INTERNAL_MCP_SERVERS[internalMCPServerName].metadata,
        toolHandlers: SKILL_AUTHORING_TOOL_HANDLERS,
        toolContext,
      });
    case "schedules_management":
      return createServer(auth, {
        serverMetadata: INTERNAL_MCP_SERVERS[internalMCPServerName].metadata,
        toolHandlers: createSchedulesManagementToolHandlers(auth, toolContext),
        toolContext,
      });
    case "productboard":
      return createServer(auth, {
        serverMetadata: INTERNAL_MCP_SERVERS[internalMCPServerName].metadata,
        toolHandlers: createProductboardToolHandlers(),
        toolContext,
      });
    case "pod_manager":
      return createServer(auth, {
        serverMetadata: INTERNAL_MCP_SERVERS[internalMCPServerName].metadata,
        toolHandlers: createProjectManagerToolHandlers(auth, toolContext),
        toolContext,
      });
    case "pod_tasks":
      return createServer(auth, {
        serverMetadata: INTERNAL_MCP_SERVERS[internalMCPServerName].metadata,
        toolHandlers: createProjectTasksToolHandlers(auth, toolContext),
        toolContext,
      });
    case "poke":
      return createServer(auth, {
        serverMetadata: INTERNAL_MCP_SERVERS[internalMCPServerName].metadata,
        toolHandlers: POKE_TOOL_HANDLERS,
        toolContext,
      });
    case "ask_user_question":
      return createServer(auth, {
        serverMetadata: INTERNAL_MCP_SERVERS[internalMCPServerName].metadata,
        toolHandlers: ASK_USER_QUESTION_TOOL_HANDLERS,
        toolContext,
      });
    case "ukg_ready":
      return createServer(auth, {
        serverMetadata: INTERNAL_MCP_SERVERS[internalMCPServerName].metadata,
        toolHandlers: UKG_READY_TOOL_HANDLERS,
        toolContext,
      });
    case "user_mentions":
      return createServer(auth, {
        serverMetadata: INTERNAL_MCP_SERVERS[internalMCPServerName].metadata,
        toolHandlers: USER_MENTIONS_TOOL_HANDLERS,
        toolContext,
      });
    case "statuspage":
      return createServer(auth, {
        serverMetadata: INTERNAL_MCP_SERVERS[internalMCPServerName].metadata,
        toolHandlers: createStatuspageToolHandlers(auth, toolContext),
        toolContext,
      });
    case "sandbox":
      return createServer(auth, {
        serverMetadata: {
          ...INTERNAL_MCP_SERVERS[internalMCPServerName].metadata,
          tools: await getAvailableSandboxToolsMetadata(auth),
        },
        toolHandlers: SANDBOX_TOOL_HANDLERS,
        toolContext,
      });
    case "sandbox_functions":
      return createServer(auth, {
        serverMetadata: INTERNAL_MCP_SERVERS[internalMCPServerName].metadata,
        toolHandlers: SANDBOX_FUNCTIONS_TOOL_HANDLERS,
        toolContext,
      });
    case "wakeups":
      return createServer(auth, {
        serverMetadata: INTERNAL_MCP_SERVERS[internalMCPServerName].metadata,
        toolHandlers: createWakeupsToolHandlers(auth, toolContext),
        toolContext,
      });
    case "plan_mode":
      return createServer(auth, {
        serverMetadata: INTERNAL_MCP_SERVERS[internalMCPServerName].metadata,
        toolHandlers: PLAN_MODE_TOOL_HANDLERS,
        toolContext,
      });
    case "workday":
      return createServer(auth, {
        serverMetadata: INTERNAL_MCP_SERVERS[internalMCPServerName].metadata,
        toolHandlers: WORKDAY_TOOL_HANDLERS,
        toolContext,
      });
    case "user_analytics":
      return createServer(auth, {
        serverMetadata: INTERNAL_MCP_SERVERS[internalMCPServerName].metadata,
        toolHandlers: USER_ANALYTICS_TOOL_HANDLERS,
        toolContext,
      });
    case "activation_recommendations":
      return createServer(auth, {
        serverMetadata: INTERNAL_MCP_SERVERS[internalMCPServerName].metadata,
        toolHandlers: ACTIVATION_RECOMMENDATIONS_TOOL_HANDLERS,
        toolContext,
      });
    default:
      assertNever(internalMCPServerName);
  }
}
