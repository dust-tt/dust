import type { InternalAllowedIconType } from "@app/components/resources/resources_icons";
import type { MCPToolStakeLevelType } from "@app/lib/actions/constants";
import { RUN_AGENT_CALL_TOOL_TIMEOUT_MS } from "@app/lib/actions/constants";
import type { ServerMetadata } from "@app/lib/actions/mcp_internal_actions/tool_definition";
import { AGENT_COPILOT_AGENT_STATE_SERVER } from "@app/lib/api/actions/servers/agent_copilot_agent_state/metadata";
import { AGENT_COPILOT_CONTEXT_SERVER } from "@app/lib/api/actions/servers/agent_copilot_context/metadata";
import { AGENT_MANAGEMENT_SERVER } from "@app/lib/api/actions/servers/agent_management/metadata";
import { AGENT_MEMORY_SERVER } from "@app/lib/api/actions/servers/agent_memory/metadata";
import {
  AGENT_ROUTER_SERVER,
  AGENT_ROUTER_SERVER_NAME,
} from "@app/lib/api/actions/servers/agent_router/metadata";
import { ASHBY_SERVER } from "@app/lib/api/actions/servers/ashby/metadata";
import { COMMON_UTILITIES_SERVER } from "@app/lib/api/actions/servers/common_utilities/metadata";
import { CONFLUENCE_SERVER } from "@app/lib/api/actions/servers/confluence/metadata";
import { CONVERSATION_FILES_SERVER } from "@app/lib/api/actions/servers/conversation_files/metadata";
import { DATA_SOURCES_FILE_SYSTEM_SERVER } from "@app/lib/api/actions/servers/data_sources_file_system/metadata";
import { DATA_WAREHOUSES_SERVER } from "@app/lib/api/actions/servers/data_warehouses/metadata";
import { DATABRICKS_SERVER } from "@app/lib/api/actions/servers/databricks/metadata";
import { DISCOVER_SKILLS_SERVER } from "@app/lib/api/actions/servers/discover_skills/metadata";
import { EXTRACT_DATA_SERVER } from "@app/lib/api/actions/servers/extract_data/metadata";
import { FILE_GENERATION_SERVER } from "@app/lib/api/actions/servers/file_generation/metadata";
import { FRESHSERVICE_SERVER } from "@app/lib/api/actions/servers/freshservice/metadata";
import { FRONT_SERVER } from "@app/lib/api/actions/servers/front/metadata";
import { GITHUB_SERVER } from "@app/lib/api/actions/servers/github/metadata";
import { GMAIL_SERVER } from "@app/lib/api/actions/servers/gmail/metadata";
import { GOOGLE_CALENDAR_SERVER } from "@app/lib/api/actions/servers/google_calendar/metadata";
import { GOOGLE_DRIVE_SERVER } from "@app/lib/api/actions/servers/google_drive/metadata";
import { GOOGLE_SHEETS_SERVER } from "@app/lib/api/actions/servers/google_sheets/metadata";
import { HTTP_CLIENT_SERVER } from "@app/lib/api/actions/servers/http_client/metadata";
import { HUBSPOT_SERVER } from "@app/lib/api/actions/servers/hubspot/metadata";
import { IMAGE_GENERATION_SERVER } from "@app/lib/api/actions/servers/image_generation/metadata";
import { INCLUDE_DATA_SERVER } from "@app/lib/api/actions/servers/include_data/metadata";
import { INTERACTIVE_CONTENT_SERVER } from "@app/lib/api/actions/servers/interactive_content/metadata";
import { JIRA_SERVER } from "@app/lib/api/actions/servers/jira/metadata";
import { JIT_TESTING_SERVER } from "@app/lib/api/actions/servers/jit_testing/metadata";
import { MICROSOFT_DRIVE_SERVER } from "@app/lib/api/actions/servers/microsoft_drive/metadata";
import { MICROSOFT_EXCEL_SERVER } from "@app/lib/api/actions/servers/microsoft_excel/metadata";
import { MICROSOFT_TEAMS_SERVER } from "@app/lib/api/actions/servers/microsoft_teams/metadata";
import { MISSING_ACTION_CATCHER_SERVER } from "@app/lib/api/actions/servers/missing_action_catcher/metadata";
import { MONDAY_SERVER } from "@app/lib/api/actions/servers/monday/metadata";
import { NOTION_SERVER } from "@app/lib/api/actions/servers/notion/metadata";
import { OPENAI_USAGE_SERVER } from "@app/lib/api/actions/servers/openai_usage/metadata";
import { OUTLOOK_CALENDAR_SERVER } from "@app/lib/api/actions/servers/outlook/calendar_metadata";
import { OUTLOOK_MAIL_SERVER } from "@app/lib/api/actions/servers/outlook/mail_metadata";
import { PRIMITIVE_TYPES_DEBUGGER_SERVER } from "@app/lib/api/actions/servers/primitive_types_debugger/metadata";
import { PRODUCTBOARD_SERVER } from "@app/lib/api/actions/servers/productboard/metadata";
import { PROJECT_CONVERSATION_SERVER } from "@app/lib/api/actions/servers/project_conversation/metadata";
import { PROJECT_MANAGER_SERVER } from "@app/lib/api/actions/servers/project_manager/metadata";
import {
  QUERY_TABLES_V2_SERVER,
  TABLE_QUERY_V2_SERVER_NAME,
} from "@app/lib/api/actions/servers/query_tables_v2/metadata";
import { RUN_AGENT_SERVER } from "@app/lib/api/actions/servers/run_agent/metadata";
import { RUN_DUST_APP_SERVER } from "@app/lib/api/actions/servers/run_dust_app/metadata";
import { SALESFORCE_SERVER } from "@app/lib/api/actions/servers/salesforce/metadata";
import { SALESLOFT_SERVER } from "@app/lib/api/actions/servers/salesloft/metadata";
import { SANDBOX_SERVER } from "@app/lib/api/actions/servers/sandbox/metadata";
import { SCHEDULES_MANAGEMENT_SERVER } from "@app/lib/api/actions/servers/schedules_management/metadata";
import { SEARCH_SERVER } from "@app/lib/api/actions/servers/search/metadata";
import { SKILL_MANAGEMENT_SERVER } from "@app/lib/api/actions/servers/skill_management/metadata";
import { SLAB_SERVER } from "@app/lib/api/actions/servers/slab/metadata";
import { SLACK_BOT_SERVER } from "@app/lib/api/actions/servers/slack_bot/metadata";
import { SLACK_PERSONAL_SERVER } from "@app/lib/api/actions/servers/slack_personal/metadata";
import { SLIDESHOW_INSTRUCTIONS } from "@app/lib/api/actions/servers/slideshow/instructions";
import { SLIDESHOW_SERVER } from "@app/lib/api/actions/servers/slideshow/metadata";
import { SNOWFLAKE_SERVER } from "@app/lib/api/actions/servers/snowflake/metadata";
import { SOUND_STUDIO_SERVER } from "@app/lib/api/actions/servers/sound_studio/metadata";
import { SPEECH_GENERATOR_SERVER } from "@app/lib/api/actions/servers/speech_generator/metadata";
import { STATUSPAGE_SERVER } from "@app/lib/api/actions/servers/statuspage/metadata";
import { TOOLSETS_SERVER } from "@app/lib/api/actions/servers/toolsets/metadata";
import { UKG_READY_SERVER } from "@app/lib/api/actions/servers/ukg_ready/metadata";
import { USER_MENTIONS_SERVER } from "@app/lib/api/actions/servers/user_mentions/metadata";
import { VAL_TOWN_SERVER } from "@app/lib/api/actions/servers/val_town/metadata";
import { VANTA_SERVER } from "@app/lib/api/actions/servers/vanta/metadata";
import {
  WEB_SEARCH_BROWSE_SERVER,
  WEB_SEARCH_BROWSE_SERVER_NAME,
} from "@app/lib/api/actions/servers/web_search_browse/metadata";
import { ZENDESK_SERVER } from "@app/lib/api/actions/servers/zendesk/metadata";
import type {
  InternalMCPServerDefinitionType,
  MCPToolRetryPolicyType,
  ToolDisplayLabels,
} from "@app/lib/api/mcp";
import { getResourceNameAndIdFromSId } from "@app/lib/resources/string_ids";
import type { PlanType } from "@app/types/plan";
import type { WhitelistableFeature } from "@app/types/shared/feature_flags";
import type { ModelId } from "@app/types/shared/model_id";
import type { Result } from "@app/types/shared/result";
import { Err, Ok } from "@app/types/shared/result";

export const ADVANCED_SEARCH_SWITCH = "advanced_search";
export const USE_SUMMARY_SWITCH = "useSummary";

export const SEARCH_TOOL_NAME = "semantic_search";
export const INCLUDE_TOOL_NAME = "retrieve_recent_documents";
export const PROCESS_TOOL_NAME = "extract_information_from_documents";

export const WEBSEARCH_TOOL_NAME = "websearch";
export const WEBBROWSER_TOOL_NAME = "webbrowser";

export const CREATE_AGENT_TOOL_NAME = "create_agent";

export const DATA_WAREHOUSES_LIST_TOOL_NAME = "list";
export const DATA_WAREHOUSES_FIND_TOOL_NAME = "find";
export const DATA_WAREHOUSES_DESCRIBE_TABLES_TOOL_NAME = "describe_tables";
export const DATA_WAREHOUSES_QUERY_TOOL_NAME = "query";

export const TOOLSETS_ENABLE_TOOL_NAME = "enable";
export const TOOLSETS_LIST_TOOL_NAME = "list";

export const SKILL_MANAGEMENT_SERVER_NAME = "skill_management";

export const GENERATE_IMAGE_TOOL_NAME = "generate_image";
// Kept for backward compatibility with existing actions in conversations.
export const EDIT_IMAGE_TOOL_NAME = "edit_image";

export const SEARCH_SERVER_NAME = "search";

export const DATA_WAREHOUSE_SERVER_NAME = "data_warehouses";

// IDs of internal MCP servers that are no longer present.
// We need to keep them to avoid breaking previous output that might reference sId that mapped to these servers.
export const LEGACY_INTERNAL_MCP_SERVER_IDS: number[] = [4];

export const AVAILABLE_INTERNAL_MCP_SERVER_NAMES = [
  // Note:
  // Names should reflect the purpose of the server but not directly the tools it contains.
  // We'll prefix all tools with the server name to avoid conflicts.
  // It's okay to change the name of the server as we don't refer to it directly.
  "agent_copilot_agent_state",
  "agent_copilot_context",
  "agent_management",
  "agent_memory",
  "agent_router",
  "ashby",
  "confluence",
  "conversation_files",
  "databricks",
  "data_sources_file_system",
  "discover_skills",
  DATA_WAREHOUSE_SERVER_NAME,
  "extract_data",
  "file_generation",
  "freshservice",
  "github",
  "gmail",
  "google_calendar",
  "google_drive",
  "google_sheets",
  "http_client",
  "hubspot",
  "image_generation",
  "include_data",
  "interactive_content",
  "slideshow",
  "jira",
  "microsoft_drive",
  "microsoft_excel",
  "microsoft_teams",
  "missing_action_catcher",
  "monday",
  "notion",
  "openai_usage",
  "outlook_calendar",
  "outlook",
  "primitive_types_debugger",
  "productboard",
  "common_utilities",
  "jit_testing",
  "run_agent",
  "run_dust_app",
  "salesforce",
  "salesloft",
  "slab",
  "slack",
  "slack_bot",
  "snowflake",
  "sound_studio",
  "speech_generator",
  "statuspage",
  "toolsets",
  "ukg_ready",
  "user_mentions",
  "val_town",
  "vanta",
  "front",
  "web_search_&_browse",
  "zendesk",
  SEARCH_SERVER_NAME,
  TABLE_QUERY_V2_SERVER_NAME,
  "skill_management",
  "schedules_management",
  "project_manager",
  "project_conversation",
  "sandbox",
] as const;

export const INTERNAL_SERVERS_WITH_WEBSEARCH = [
  "web_search_&_browse",
  "http_client",
] as const;

// Whether the server is available by default in the global space.
// Hidden servers are available by default in the global space but are not visible in the assistant builder.
// eslint-disable-next-line @typescript-eslint/no-unused-vars
const MCP_SERVER_AVAILABILITY = [
  "manual",
  "auto",
  "auto_hidden_builder",
] as const;
export type MCPServerAvailability = (typeof MCP_SERVER_AVAILABILITY)[number];

export const INTERNAL_MCP_SERVERS = {
  // Note:
  // ids should be stable, do not change them when moving internal servers to production as it would break existing agents.

  github: {
    id: 1,
    availability: "manual",
    allowMultipleInstances: true,
    isRestricted: undefined,
    isPreview: false,
    tools_arguments_requiring_approval: undefined,
    tools_retry_policies: undefined,
    timeoutMs: undefined,
    metadata: GITHUB_SERVER,
  },
  image_generation: {
    id: 2,
    availability: "auto",
    allowMultipleInstances: false,
    isRestricted: undefined,
    isPreview: false,
    tools_arguments_requiring_approval: undefined,
    tools_retry_policies: undefined,
    timeoutMs: undefined,
    metadata: IMAGE_GENERATION_SERVER,
  },
  file_generation: {
    id: 3,
    availability: "auto",
    allowMultipleInstances: false,
    isRestricted: undefined,
    isPreview: false,
    tools_arguments_requiring_approval: undefined,
    tools_retry_policies: undefined,
    timeoutMs: undefined,
    metadata: FILE_GENERATION_SERVER,
  },
  [WEB_SEARCH_BROWSE_SERVER_NAME]: {
    id: 5,
    availability: "auto",
    allowMultipleInstances: false,
    isRestricted: undefined,
    isPreview: false,
    tools_arguments_requiring_approval: undefined,
    tools_retry_policies: { default: "retry_on_interrupt" },
    timeoutMs: undefined,
    metadata: WEB_SEARCH_BROWSE_SERVER,
  },
  hubspot: {
    id: 7,
    availability: "manual",
    allowMultipleInstances: true,
    isRestricted: undefined,
    isPreview: false,
    tools_arguments_requiring_approval: undefined,
    tools_retry_policies: undefined,
    timeoutMs: undefined,
    metadata: HUBSPOT_SERVER,
  },
  [AGENT_ROUTER_SERVER_NAME]: {
    id: 8,
    availability: "auto_hidden_builder",
    allowMultipleInstances: false,
    isRestricted: undefined,
    isPreview: false,
    tools_arguments_requiring_approval: undefined,
    tools_retry_policies: undefined,
    timeoutMs: undefined,
    metadata: AGENT_ROUTER_SERVER,
  },
  include_data: {
    id: 9,
    availability: "auto",
    allowMultipleInstances: false,
    isRestricted: undefined,
    isPreview: false,
    tools_arguments_requiring_approval: undefined,
    tools_retry_policies: { default: "retry_on_interrupt" },
    timeoutMs: undefined,
    metadata: INCLUDE_DATA_SERVER,
  },
  run_dust_app: {
    id: 10,
    availability: "auto",
    allowMultipleInstances: true,
    isRestricted: ({ featureFlags }) => {
      return !featureFlags.includes("legacy_dust_apps");
    },
    isPreview: false,
    tools_arguments_requiring_approval: undefined,
    tools_retry_policies: undefined,
    timeoutMs: undefined,
    metadata: RUN_DUST_APP_SERVER,
  },
  notion: {
    id: 11,
    availability: "manual",
    allowMultipleInstances: true,
    isRestricted: undefined,
    isPreview: false,
    tools_arguments_requiring_approval: undefined,
    tools_retry_policies: undefined,
    timeoutMs: undefined,
    metadata: NOTION_SERVER,
  },
  extract_data: {
    id: 12,
    availability: "auto",
    allowMultipleInstances: false,
    isRestricted: undefined,
    isPreview: false,
    tools_arguments_requiring_approval: undefined,
    tools_retry_policies: { default: "retry_on_interrupt" },
    timeoutMs: undefined,
    metadata: EXTRACT_DATA_SERVER,
  },
  missing_action_catcher: {
    id: 13,
    availability: "auto_hidden_builder",
    allowMultipleInstances: false,
    isRestricted: undefined,
    isPreview: false,
    tools_arguments_requiring_approval: undefined,
    tools_retry_policies: undefined,
    timeoutMs: undefined,
    metadata: MISSING_ACTION_CATCHER_SERVER,
  },
  salesforce: {
    id: 14,
    availability: "manual",
    allowMultipleInstances: true,
    isRestricted: ({ featureFlags, plan }) => {
      const isInPlan = plan.limits.connections.isSalesforceAllowed;
      const hasFeatureFlag = featureFlags.includes("salesforce_tool");
      const isAvailable = isInPlan || hasFeatureFlag;
      return !isAvailable;
    },
    isPreview: false,
    tools_arguments_requiring_approval: undefined,
    tools_retry_policies: undefined,
    timeoutMs: undefined,
    metadata: SALESFORCE_SERVER,
  },
  gmail: {
    id: 15,
    availability: "manual",
    allowMultipleInstances: true,
    isRestricted: undefined,
    isPreview: false,
    tools_arguments_requiring_approval: {
      create_draft: ["to"],
      send_mail: ["to"],
    },
    tools_retry_policies: undefined,
    timeoutMs: undefined,
    metadata: GMAIL_SERVER,
  },
  google_calendar: {
    id: 16,
    availability: "manual",
    allowMultipleInstances: true,
    isRestricted: undefined,
    isPreview: false,
    tools_arguments_requiring_approval: {
      create_event: ["calendarId"],
      update_event: ["calendarId"],
      delete_event: ["calendarId"],
    },
    tools_retry_policies: undefined,
    timeoutMs: undefined,
    metadata: GOOGLE_CALENDAR_SERVER,
  },
  conversation_files: {
    id: 17,
    availability: "auto_hidden_builder",
    allowMultipleInstances: false,
    isRestricted: undefined,
    isPreview: false,
    tools_arguments_requiring_approval: undefined,
    tools_retry_policies: undefined,
    timeoutMs: undefined,
    metadata: CONVERSATION_FILES_SERVER,
  },
  slack: {
    id: 18,
    availability: "manual",
    allowMultipleInstances: true,
    isRestricted: undefined,
    isPreview: false,
    tools_arguments_requiring_approval: {
      post_message: ["channel"],
      schedule_message: ["channel"],
    },
    tools_retry_policies: undefined,
    timeoutMs: undefined,
    metadata: SLACK_PERSONAL_SERVER,
  },
  google_sheets: {
    id: 19,
    availability: "manual",
    allowMultipleInstances: true,
    isRestricted: ({ featureFlags }) => {
      return !featureFlags.includes("google_sheets_tool");
    },
    isPreview: true,
    tools_arguments_requiring_approval: undefined,
    tools_retry_policies: undefined,
    timeoutMs: undefined,
    metadata: GOOGLE_SHEETS_SERVER,
  },
  monday: {
    id: 20,
    availability: "manual",
    allowMultipleInstances: true,
    isRestricted: ({ featureFlags }) => {
      return !featureFlags.includes("monday_tool");
    },
    isPreview: true,
    tools_arguments_requiring_approval: undefined,
    tools_retry_policies: undefined,
    timeoutMs: undefined,
    metadata: MONDAY_SERVER,
  },
  agent_memory: {
    id: 21,
    availability: "auto",
    allowMultipleInstances: false,
    isRestricted: undefined,
    isPreview: false,
    tools_arguments_requiring_approval: undefined,
    tools_retry_policies: undefined,
    timeoutMs: undefined,
    metadata: AGENT_MEMORY_SERVER,
  },
  jira: {
    id: 22,
    availability: "manual",
    allowMultipleInstances: true,
    isRestricted: undefined,
    isPreview: false,
    tools_arguments_requiring_approval: undefined,
    tools_retry_policies: undefined,
    timeoutMs: undefined,
    metadata: JIRA_SERVER,
  },
  interactive_content: {
    id: 23,
    availability: "auto_hidden_builder",
    allowMultipleInstances: false,
    isRestricted: undefined,
    isPreview: false,
    tools_arguments_requiring_approval: undefined,
    tools_retry_policies: undefined,
    timeoutMs: undefined,
    metadata: INTERACTIVE_CONTENT_SERVER,
  },
  outlook: {
    id: 24,
    availability: "manual",
    allowMultipleInstances: true,
    isRestricted: undefined,
    isPreview: false,
    tools_arguments_requiring_approval: {
      create_draft: ["to"],
    },
    tools_retry_policies: undefined,
    timeoutMs: undefined,
    metadata: OUTLOOK_MAIL_SERVER,
  },
  outlook_calendar: {
    id: 25,
    availability: "manual",
    allowMultipleInstances: true,
    isRestricted: undefined,
    isPreview: false,
    tools_arguments_requiring_approval: undefined,
    tools_retry_policies: undefined,
    timeoutMs: undefined,
    metadata: OUTLOOK_CALENDAR_SERVER,
  },
  freshservice: {
    id: 26,
    availability: "manual",
    allowMultipleInstances: true,
    isRestricted: undefined,
    isPreview: false,
    tools_arguments_requiring_approval: undefined,
    tools_retry_policies: undefined,
    timeoutMs: undefined,
    metadata: FRESHSERVICE_SERVER,
  },
  google_drive: {
    id: 27,
    availability: "manual",
    allowMultipleInstances: true,
    isRestricted: undefined,
    isPreview: false,
    tools_arguments_requiring_approval: undefined,
    tools_retry_policies: { default: "retry_on_interrupt" },
    timeoutMs: undefined,
    metadata: GOOGLE_DRIVE_SERVER,
  },
  slideshow: {
    id: 28,
    availability: "auto",
    allowMultipleInstances: false,
    isRestricted: ({ featureFlags }) => {
      return !featureFlags.includes("slideshow");
    },
    isPreview: true,
    tools_arguments_requiring_approval: undefined,
    tools_retry_policies: undefined,
    timeoutMs: undefined,
    metadata: {
      ...SLIDESHOW_SERVER,
      serverInfo: {
        ...SLIDESHOW_SERVER.serverInfo,
        // TBD if turned into a global skill or not.
        // eslint-disable-next-line dust/no-mcp-server-instructions
        instructions: SLIDESHOW_INSTRUCTIONS,
      },
    },
  },
  slack_bot: {
    id: 31,
    availability: "manual" as const,
    allowMultipleInstances: true,
    isRestricted: ({ featureFlags }) => {
      return !featureFlags.includes("slack_bot_mcp");
    },
    isPreview: true,
    tools_arguments_requiring_approval: undefined,
    tools_retry_policies: undefined,
    timeoutMs: undefined,
    metadata: SLACK_BOT_SERVER,
  },
  openai_usage: {
    id: 32,
    availability: "manual",
    allowMultipleInstances: false,
    isPreview: true,
    isRestricted: ({ featureFlags }) => {
      return !featureFlags.includes("openai_usage_mcp");
    },
    tools_arguments_requiring_approval: undefined,
    tools_retry_policies: undefined,
    timeoutMs: undefined,
    metadata: OPENAI_USAGE_SERVER,
  },
  confluence: {
    id: 33,
    availability: "manual",
    allowMultipleInstances: true,
    isRestricted: ({ featureFlags }) => {
      return !featureFlags.includes("confluence_tool");
    },
    isPreview: true,
    tools_arguments_requiring_approval: undefined,
    tools_retry_policies: undefined,
    timeoutMs: undefined,
    metadata: CONFLUENCE_SERVER,
  },
  speech_generator: {
    id: 34,
    availability: "auto",
    allowMultipleInstances: false,
    isRestricted: undefined,
    isPreview: false,
    tools_arguments_requiring_approval: undefined,
    tools_retry_policies: { default: "retry_on_interrupt" },
    timeoutMs: undefined,
    metadata: SPEECH_GENERATOR_SERVER,
  },
  microsoft_drive: {
    id: 35,
    availability: "manual",
    allowMultipleInstances: true,
    isRestricted: undefined,
    isPreview: false,
    tools_stakes: {
      search_in_files: "never_ask",
      search_drive_items: "never_ask",
      update_word_document: "high",
      get_file_content: "never_ask",
      upload_file: "high",
    },
    tools_arguments_requiring_approval: undefined,
    tools_retry_policies: undefined,
    timeoutMs: undefined,
    metadata: {
      ...MICROSOFT_DRIVE_SERVER,
      serverInfo: {
        ...MICROSOFT_DRIVE_SERVER.serverInfo,
        authorization: {
          provider: "microsoft_tools" as const,
          supported_use_cases: ["personal_actions"] as const,
          scope:
            "User.Read Files.ReadWrite.All Sites.Read.All ExternalItem.Read.All offline_access" as const,
        },
        documentationUrl:
          "https://docs.dust.tt/docs/microsoft-drive-tool-setup",
      },
    },
  },
  microsoft_teams: {
    id: 36,
    availability: "manual",
    allowMultipleInstances: true,
    isRestricted: undefined,
    isPreview: false,
    tools_stakes: {
      search_messages_content: "never_ask",
      list_teams: "never_ask",
      list_users: "never_ask",
      list_channels: "never_ask",
      list_chats: "never_ask",
      list_messages: "never_ask",
      post_message: "medium",
    },
    tools_arguments_requiring_approval: {
      post_message: ["channelId"],
    },
    tools_retry_policies: undefined,
    timeoutMs: undefined,
    metadata: {
      ...MICROSOFT_TEAMS_SERVER,
      serverInfo: {
        ...MICROSOFT_TEAMS_SERVER.serverInfo,
        authorization: {
          provider: "microsoft_tools" as const,
          supported_use_cases: ["personal_actions"] as const,
          scope:
            "User.Read User.ReadBasic.All Team.ReadBasic.All Channel.ReadBasic.All Chat.Read Chat.ReadWrite ChatMessage.Read ChatMessage.Send ChannelMessage.Read.All ChannelMessage.Send offline_access" as const,
        },
        documentationUrl:
          "https://docs.dust.tt/docs/microsoft-teams-tool-setup",
      },
    },
  },
  sound_studio: {
    id: 37,
    availability: "manual",
    allowMultipleInstances: false,
    isRestricted: undefined,
    isPreview: false,
    tools_arguments_requiring_approval: undefined,
    tools_retry_policies: { default: "retry_on_interrupt" },
    timeoutMs: undefined,
    metadata: SOUND_STUDIO_SERVER,
  },
  microsoft_excel: {
    id: 38,
    availability: "manual",
    allowMultipleInstances: true,
    isRestricted: undefined,
    isPreview: false,
    tools_arguments_requiring_approval: undefined,
    tools_retry_policies: undefined,
    timeoutMs: undefined,
    metadata: {
      ...MICROSOFT_EXCEL_SERVER,
      serverInfo: {
        ...MICROSOFT_EXCEL_SERVER.serverInfo,
        authorization: {
          provider: "microsoft_tools" as const,
          supported_use_cases: ["personal_actions"] as const,
          scope:
            "User.Read Files.ReadWrite.All Sites.Read.All offline_access" as const,
        },
      },
    },
  },
  http_client: {
    id: 39,
    availability: "manual",
    allowMultipleInstances: false,
    isRestricted: ({ featureFlags }) => {
      return !featureFlags.includes("http_client_tool");
    },
    isPreview: true,
    tools_stakes: {
      send_request: "low",
      websearch: "never_ask",
      webbrowser: "never_ask",
    },
    tools_arguments_requiring_approval: undefined,
    tools_retry_policies: undefined,
    timeoutMs: undefined,
    metadata: HTTP_CLIENT_SERVER,
  },
  ashby: {
    id: 40,
    availability: "manual",
    allowMultipleInstances: false,
    isRestricted: ({ featureFlags }) => {
      return !featureFlags.includes("ashby_tool");
    },
    isPreview: true,
    tools_arguments_requiring_approval: undefined,
    tools_retry_policies: undefined,
    timeoutMs: undefined,
    metadata: ASHBY_SERVER,
  },
  salesloft: {
    id: 41,
    availability: "manual",
    allowMultipleInstances: false,
    isRestricted: ({ featureFlags }) => {
      return !featureFlags.includes("salesloft_tool");
    },
    isPreview: true,
    tools_arguments_requiring_approval: undefined,
    tools_retry_policies: undefined,
    timeoutMs: undefined,
    metadata: SALESLOFT_SERVER,
  },
  zendesk: {
    id: 42,
    availability: "manual",
    allowMultipleInstances: true,
    isRestricted: undefined,
    isPreview: false,
    tools_arguments_requiring_approval: undefined,
    tools_retry_policies: undefined,
    timeoutMs: undefined,
    metadata: ZENDESK_SERVER,
  },
  slab: {
    id: 43,
    availability: "manual",
    allowMultipleInstances: true,
    isRestricted: ({ featureFlags }) => {
      return !featureFlags.includes("slab_mcp");
    },
    isPreview: true,
    requiresBearerToken: true,
    tools_arguments_requiring_approval: undefined,
    tools_retry_policies: undefined,
    timeoutMs: undefined,
    metadata: SLAB_SERVER,
  },
  vanta: {
    id: 44,
    availability: "manual",
    allowMultipleInstances: true,
    isRestricted: undefined,
    isPreview: false,
    tools_arguments_requiring_approval: undefined,
    tools_retry_policies: undefined,
    timeoutMs: undefined,
    metadata: VANTA_SERVER,
  },
  databricks: {
    id: 45,
    availability: "manual",
    allowMultipleInstances: true,
    isRestricted: ({ featureFlags }) => {
      return !featureFlags.includes("databricks_tool");
    },
    isPreview: true,
    tools_arguments_requiring_approval: undefined,
    tools_retry_policies: undefined,
    timeoutMs: undefined,
    metadata: DATABRICKS_SERVER,
  },
  productboard: {
    id: 46,
    availability: "manual",
    allowMultipleInstances: true,
    isRestricted: undefined,
    isPreview: false,
    tools_arguments_requiring_approval: undefined,
    tools_retry_policies: undefined,
    timeoutMs: undefined,
    metadata: PRODUCTBOARD_SERVER,
  },
  snowflake: {
    id: 47,
    availability: "manual",
    allowMultipleInstances: true,
    isRestricted: ({ featureFlags }) => {
      return !featureFlags.includes("snowflake_tool");
    },
    isPreview: false,
    tools_arguments_requiring_approval: undefined,
    tools_retry_policies: undefined,
    timeoutMs: undefined,
    metadata: SNOWFLAKE_SERVER,
  },
  ukg_ready: {
    id: 48,
    availability: "manual",
    allowMultipleInstances: true,
    isRestricted: undefined,
    isPreview: false,
    tools_arguments_requiring_approval: undefined,
    tools_retry_policies: undefined,
    timeoutMs: undefined,
    metadata: UKG_READY_SERVER,
  },
  statuspage: {
    id: 49,
    availability: "manual",
    allowMultipleInstances: false,
    isRestricted: ({ featureFlags }) => {
      return !featureFlags.includes("statuspage_tool");
    },
    isPreview: true,
    tools_arguments_requiring_approval: undefined,
    tools_retry_policies: undefined,
    timeoutMs: undefined,
    metadata: STATUSPAGE_SERVER,
  },
  primitive_types_debugger: {
    id: 1004,
    availability: "manual",
    allowMultipleInstances: false,
    isPreview: false,
    isRestricted: ({ featureFlags }) => {
      return !featureFlags.includes("dev_mcp_actions");
    },
    tools_arguments_requiring_approval: undefined,
    tools_retry_policies: undefined,
    timeoutMs: undefined,
    metadata: PRIMITIVE_TYPES_DEBUGGER_SERVER,
  },
  [SEARCH_SERVER_NAME]: {
    id: 1006,
    availability: "auto",
    allowMultipleInstances: false,
    isRestricted: undefined,
    isPreview: false,
    tools_arguments_requiring_approval: undefined,
    tools_retry_policies: { default: "retry_on_interrupt" },
    timeoutMs: undefined,
    metadata: SEARCH_SERVER,
  },
  run_agent: {
    id: 1008,
    availability: "auto",
    allowMultipleInstances: true,
    isRestricted: undefined,
    isPreview: false,
    tools_arguments_requiring_approval: undefined,
    tools_retry_policies: { default: "retry_on_interrupt" },
    timeoutMs: RUN_AGENT_CALL_TOOL_TIMEOUT_MS,
    metadata: RUN_AGENT_SERVER,
  },
  [TABLE_QUERY_V2_SERVER_NAME]: {
    id: 1009,
    availability: "auto",
    allowMultipleInstances: false,
    isRestricted: undefined,
    isPreview: false,
    tools_arguments_requiring_approval: undefined,
    tools_retry_policies: undefined,
    timeoutMs: undefined,
    metadata: QUERY_TABLES_V2_SERVER,
  },
  data_sources_file_system: {
    id: 1010,
    // This server is hidden for everyone, it is only available through the search tool
    // when the advanced_search mode is enabled.
    availability: "auto_hidden_builder",
    allowMultipleInstances: false,
    isRestricted: undefined,
    isPreview: false,
    tools_arguments_requiring_approval: undefined,
    tools_retry_policies: undefined,
    timeoutMs: undefined,
    metadata: DATA_SOURCES_FILE_SYSTEM_SERVER,
  },
  discover_skills: {
    id: 1027,
    availability: "auto_hidden_builder",
    allowMultipleInstances: false,
    isRestricted: ({ featureFlags }) => {
      return !featureFlags.includes("discover_skills_tool");
    },
    isPreview: false,
    tools_arguments_requiring_approval: undefined,
    tools_retry_policies: undefined,
    timeoutMs: undefined,
    metadata: DISCOVER_SKILLS_SERVER,
  },
  agent_management: {
    id: 1011,
    availability: "auto",
    allowMultipleInstances: false,
    isPreview: false,
    isRestricted: ({ featureFlags }) => {
      return !featureFlags.includes("agent_management_tool");
    },
    tools_arguments_requiring_approval: undefined,
    tools_retry_policies: undefined,
    timeoutMs: undefined,
    metadata: AGENT_MANAGEMENT_SERVER,
  },
  [DATA_WAREHOUSE_SERVER_NAME]: {
    id: 1012,
    availability: "auto_hidden_builder",
    allowMultipleInstances: false,
    isPreview: false,
    isRestricted: undefined,
    tools_arguments_requiring_approval: undefined,
    tools_retry_policies: undefined,
    timeoutMs: undefined,
    metadata: DATA_WAREHOUSES_SERVER,
  },
  toolsets: {
    id: 1013,
    availability: "auto_hidden_builder",
    allowMultipleInstances: false,
    isPreview: false,
    isRestricted: undefined,
    tools_arguments_requiring_approval: undefined,
    tools_retry_policies: undefined,
    timeoutMs: undefined,
    metadata: TOOLSETS_SERVER,
  },
  val_town: {
    id: 1014,
    availability: "manual",
    allowMultipleInstances: false,
    isPreview: false,
    isRestricted: undefined,
    tools_arguments_requiring_approval: undefined,
    tools_retry_policies: undefined,
    timeoutMs: undefined,
    metadata: VAL_TOWN_SERVER,
  },
  jit_testing: {
    id: 1016,
    availability: "manual",
    allowMultipleInstances: false,
    isPreview: false,
    isRestricted: ({ featureFlags }) => {
      return !featureFlags.includes("dev_mcp_actions");
    },
    tools_arguments_requiring_approval: undefined,
    tools_retry_policies: undefined,
    timeoutMs: undefined,
    metadata: JIT_TESTING_SERVER,
  },
  common_utilities: {
    id: 1017,
    availability: "auto_hidden_builder",
    allowMultipleInstances: false,
    isPreview: false,
    isRestricted: undefined,
    tools_arguments_requiring_approval: undefined,
    tools_retry_policies: undefined,
    timeoutMs: undefined,
    metadata: COMMON_UTILITIES_SERVER,
  },
  front: {
    id: 1018,
    availability: "manual",
    allowMultipleInstances: false,
    isRestricted: ({ featureFlags }) => {
      return !featureFlags.includes("front_tool");
    },
    isPreview: true,
    tools_arguments_requiring_approval: undefined,
    tools_retry_policies: { default: "retry_on_interrupt" },
    timeoutMs: undefined,
    metadata: FRONT_SERVER,
  },
  skill_management: {
    id: 1019,
    availability: "auto_hidden_builder",
    allowMultipleInstances: false,
    isPreview: false,
    isRestricted: undefined,
    tools_arguments_requiring_approval: undefined,
    tools_retry_policies: undefined,
    timeoutMs: undefined,
    metadata: SKILL_MANAGEMENT_SERVER,
  },
  schedules_management: {
    id: 1020,
    availability: "auto_hidden_builder",
    allowMultipleInstances: false,
    isPreview: false,
    isRestricted: undefined,
    tools_arguments_requiring_approval: undefined,
    tools_retry_policies: undefined,
    timeoutMs: undefined,
    metadata: SCHEDULES_MANAGEMENT_SERVER,
  },
  project_manager: {
    id: 1021,
    availability: "auto_hidden_builder",
    allowMultipleInstances: false,
    isPreview: false,
    isRestricted: ({ featureFlags }) => {
      return !featureFlags.includes("projects");
    },
    tools_arguments_requiring_approval: undefined,
    tools_retry_policies: undefined,
    timeoutMs: undefined,
    metadata: PROJECT_MANAGER_SERVER,
  },
  agent_copilot_context: {
    id: 1022,
    availability: "auto_hidden_builder",
    allowMultipleInstances: false,
    isPreview: false,
    isRestricted: ({ featureFlags }) => {
      return !featureFlags.includes("agent_builder_copilot");
    },
    tools_arguments_requiring_approval: undefined,
    tools_retry_policies: undefined,
    timeoutMs: undefined,
    metadata: AGENT_COPILOT_CONTEXT_SERVER,
  },
  agent_copilot_agent_state: {
    id: 1023,
    availability: "auto_hidden_builder",
    allowMultipleInstances: false,
    isPreview: false,
    isRestricted: ({ featureFlags }) => {
      return !featureFlags.includes("agent_builder_copilot");
    },
    tools_arguments_requiring_approval: undefined,
    tools_retry_policies: undefined,
    timeoutMs: undefined,
    metadata: AGENT_COPILOT_AGENT_STATE_SERVER,
  },
  sandbox: {
    id: 1024,
    availability: "auto",
    allowMultipleInstances: false,
    isPreview: true,
    isRestricted: ({ featureFlags }) => {
      return !featureFlags.includes("sandbox_tools");
    },
    metadata: SANDBOX_SERVER,
    tools_arguments_requiring_approval: undefined,
    tools_retry_policies: undefined,
    timeoutMs: 120000, // 2 minutes for command execution
  },
  project_conversation: {
    id: 1025,
    availability: "auto",
    allowMultipleInstances: false,
    isPreview: false,
    isRestricted: ({ featureFlags }) => {
      return !featureFlags.includes("projects");
    },
    tools_arguments_requiring_approval: undefined,
    tools_retry_policies: undefined,
    timeoutMs: undefined,
    metadata: PROJECT_CONVERSATION_SERVER,
  },
  user_mentions: {
    id: 1026,
    availability: "auto_hidden_builder",
    allowMultipleInstances: false,
    isPreview: false,
    isRestricted: undefined,
    tools_arguments_requiring_approval: undefined,
    tools_retry_policies: undefined,
    timeoutMs: undefined,
    metadata: USER_MENTIONS_SERVER,
  },
  // Using satisfies here instead of: type to avoid TypeScript widening the type and breaking the type inference for AutoInternalMCPServerNameType.
} satisfies {
  [K in InternalMCPServerNameType]: InternalMCPServerEntryBase<K>;
};

type InternalMCPServerEntryCommon = {
  id: number;
  availability: MCPServerAvailability;
  allowMultipleInstances: boolean;
  isRestricted:
    | ((params: {
        plan: PlanType;
        featureFlags: WhitelistableFeature[];
        isDeepDiveDisabled: boolean;
      }) => boolean)
    | undefined;
  isPreview: boolean;
  // Defines which arguments require per-agent approval for "medium" stake tools.
  // When a tool has "medium" stake, the user must approve the specific combination
  // of (agent, tool, argument values) before the tool can execute.
  tools_arguments_requiring_approval: Record<string, string[]> | undefined;
  tools_retry_policies: Record<string, MCPToolRetryPolicyType> | undefined;
  timeoutMs: number | undefined;
  requiresBearerToken?: boolean;
};

type InternalMCPServerEntryWithMetadata<K extends InternalMCPServerNameType> =
  InternalMCPServerEntryCommon & {
    metadata: ServerMetadata;
    serverInfo?: InternalMCPServerDefinitionType & { name: K };
    tools_stakes?: Record<string, MCPToolStakeLevelType>;
  };

type InternalMCPServerEntryWithoutMetadata<
  K extends InternalMCPServerNameType,
> = InternalMCPServerEntryCommon & {
  metadata?: undefined;
  serverInfo: InternalMCPServerDefinitionType & { name: K };
  tools_stakes: Record<string, MCPToolStakeLevelType> | undefined;
};

type InternalMCPServerEntryBase<K extends InternalMCPServerNameType> =
  | InternalMCPServerEntryWithMetadata<K>
  | InternalMCPServerEntryWithoutMetadata<K>;

type InternalMCPServerEntry =
  InternalMCPServerEntryBase<InternalMCPServerNameType>;

export type InternalMCPServerNameType =
  (typeof AVAILABLE_INTERNAL_MCP_SERVER_NAMES)[number];

type AutoServerKeys<T> = {
  [K in keyof T]: T[K] extends { availability: "auto" | "auto_hidden_builder" }
    ? K
    : never;
}[keyof T];

export type AutoInternalMCPServerNameType = AutoServerKeys<
  typeof INTERNAL_MCP_SERVERS
>;

export function isAutoInternalMCPServerName(
  name: InternalMCPServerNameType
): name is AutoInternalMCPServerNameType {
  return (
    INTERNAL_MCP_SERVERS[name].availability === "auto" ||
    INTERNAL_MCP_SERVERS[name].availability === "auto_hidden_builder"
  );
}

export function getAvailabilityOfInternalMCPServerByName(
  name: InternalMCPServerNameType
): MCPServerAvailability {
  return INTERNAL_MCP_SERVERS[name].availability;
}

export function getAvailabilityOfInternalMCPServerById(
  sId: string
): MCPServerAvailability {
  const r = getInternalMCPServerNameAndWorkspaceId(sId);
  if (r.isErr()) {
    return "manual";
  }
  return getAvailabilityOfInternalMCPServerByName(r.value.name);
}

export function allowsMultipleInstancesOfInternalMCPServerByName(
  name: InternalMCPServerNameType
): boolean {
  return INTERNAL_MCP_SERVERS[name].allowMultipleInstances;
}

export function allowsMultipleInstancesOfInternalMCPServerById(
  sId: string
): boolean {
  const r = getInternalMCPServerNameAndWorkspaceId(sId);
  if (r.isErr()) {
    return false;
  }
  return !!INTERNAL_MCP_SERVERS[r.value.name].allowMultipleInstances;
}

export function getInternalMCPServerNameAndWorkspaceId(sId: string): Result<
  {
    name: InternalMCPServerNameType;
    workspaceModelId: ModelId;
  },
  Error
> {
  const sIdParts = getResourceNameAndIdFromSId(sId);

  if (!sIdParts) {
    return new Err(new Error(`Invalid internal MCPServer sId: ${sId}`));
  }

  if (sIdParts.resourceName !== "internal_mcp_server") {
    return new Err(
      new Error(
        `Invalid internal MCPServer sId: ${sId}, does not refer to an internal MCP server.`
      )
    );
  }

  // Swap keys and values.
  const details = Object.entries(INTERNAL_MCP_SERVERS).find(
    ([, internalMCPServer]) => internalMCPServer.id === sIdParts.resourceModelId
  );

  if (!details) {
    return new Err(
      new Error(
        `Invalid internal MCPServer sId: ${sId}, ID does not match any known internal MCPServer.`
      )
    );
  }

  if (!isInternalMCPServerName(details[0])) {
    return new Err(
      new Error(`Invalid internal MCPServer name: ${details[0]}, sId: ${sId}`)
    );
  }

  const name = details[0];

  return new Ok({
    name,
    workspaceModelId: sIdParts.workspaceModelId,
  });
}

export function getInternalMCPServerNameFromSId(
  sId: string | null
): InternalMCPServerNameType | null {
  if (sId === null) {
    return null;
  }

  const r = getInternalMCPServerNameAndWorkspaceId(sId);
  if (r.isOk()) {
    return r.value.name;
  }

  return null;
}

export function getInternalMCPServerIconByName(
  name: InternalMCPServerNameType
): InternalAllowedIconType {
  const server: InternalMCPServerEntry = INTERNAL_MCP_SERVERS[name];

  return server.metadata.serverInfo.icon;
}

export function getInternalMCPServerToolStakes(
  name: InternalMCPServerNameType
): Record<string, MCPToolStakeLevelType> {
  const server: InternalMCPServerEntry = INTERNAL_MCP_SERVERS[name];

  return server.metadata.tools_stakes;
}

// TODO(2026-01-27 MCP): improve typing once all servers are migrated to the metadata pattern.
// Goal is to tie the tool name to the server name.
export function getInternalMCPServerToolDisplayLabels(
  name: InternalMCPServerNameType
): Record<string, ToolDisplayLabels> | null {
  const server = INTERNAL_MCP_SERVERS[name];

  const entries = server.metadata.tools
    .filter(
      (tool): tool is typeof tool & { displayLabels: ToolDisplayLabels } =>
        tool.displayLabels !== undefined
    )
    .map((tool) => [tool.name, tool.displayLabels] as const);

  if (entries.length === 0) {
    return null;
  }

  return Object.fromEntries(entries);
}

export function getInternalMCPServerInfo(
  name: InternalMCPServerNameType
): InternalMCPServerDefinitionType {
  const server: InternalMCPServerEntry = INTERNAL_MCP_SERVERS[name];

  return server.metadata.serverInfo;
}

export function isInternalMCPServerName(
  name: string
): name is InternalMCPServerNameType {
  return AVAILABLE_INTERNAL_MCP_SERVER_NAMES.includes(
    name as InternalMCPServerNameType
  );
}

export function isValidInternalMCPServerId(
  workspaceModelId: ModelId,
  sId: string
): boolean {
  const r = getInternalMCPServerNameAndWorkspaceId(sId);
  if (r.isOk()) {
    return r.value.workspaceModelId === workspaceModelId;
  }

  return false;
}

export function matchesInternalMCPServerName(
  sId: string | null,
  name: InternalMCPServerNameType
): boolean {
  if (sId === null) {
    return false;
  }

  const r = getInternalMCPServerNameAndWorkspaceId(sId);
  if (r.isOk()) {
    return r.value.name === name;
  }

  return false;
}

export function getInternalMCPServerMetadata(
  name: InternalMCPServerNameType
): ServerMetadata {
  const server: InternalMCPServerEntry = INTERNAL_MCP_SERVERS[name];

  return server.metadata;
}
