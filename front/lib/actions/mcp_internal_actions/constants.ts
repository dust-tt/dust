import type { InternalAllowedIconType } from "@app/components/resources/resources_icons";
import type { MCPToolStakeLevelType } from "@app/lib/actions/constants";
import {
  DEFAULT_AGENT_ROUTER_ACTION_NAME,
  DEFAULT_MCP_REQUEST_TIMEOUT_MS,
  DEFAULT_WEBSEARCH_ACTION_NAME,
} from "@app/lib/actions/constants";
import {
  AGENT_MANAGEMENT_SERVER_INFO,
  AGENT_MANAGEMENT_TOOL_STAKES,
  AGENT_MANAGEMENT_TOOLS,
} from "@app/lib/actions/mcp_internal_actions/servers/agent_management/metadata";
import {
  AGENT_MEMORY_SERVER_INFO,
  AGENT_MEMORY_TOOLS,
} from "@app/lib/actions/mcp_internal_actions/servers/agent_memory/metadata";
import {
  AGENT_ROUTER_SERVER_INFO,
  AGENT_ROUTER_TOOLS,
} from "@app/lib/actions/mcp_internal_actions/servers/agent_router/metadata";
import {
  ASHBY_SERVER_INFO,
  ASHBY_TOOL_STAKES,
  ASHBY_TOOLS,
} from "@app/lib/actions/mcp_internal_actions/servers/ashby/metadata";
import {
  COMMON_UTILITIES_SERVER_INFO,
  COMMON_UTILITIES_TOOLS,
} from "@app/lib/actions/mcp_internal_actions/servers/common_utilities/metadata";
import {
  CONFLUENCE_SERVER_INFO,
  CONFLUENCE_TOOL_STAKES,
  CONFLUENCE_TOOLS,
} from "@app/lib/actions/mcp_internal_actions/servers/confluence/metadata";
import {
  CONVERSATION_FILES_SERVER_INFO,
  CONVERSATION_FILES_TOOLS,
} from "@app/lib/actions/mcp_internal_actions/servers/conversation_files/metadata";
import { DATA_SOURCES_FILE_SYSTEM_SERVER_INFO } from "@app/lib/actions/mcp_internal_actions/servers/data_sources_file_system/metadata";
import {
  DATA_WAREHOUSES_SERVER_INFO,
  DATA_WAREHOUSES_TOOLS,
} from "@app/lib/actions/mcp_internal_actions/servers/data_warehouses/metadata";
export {
  DATA_WAREHOUSES_DESCRIBE_TABLES_TOOL_NAME,
  DATA_WAREHOUSES_FIND_TOOL_NAME,
  DATA_WAREHOUSES_LIST_TOOL_NAME,
  DATA_WAREHOUSES_QUERY_TOOL_NAME,
} from "@app/lib/actions/mcp_internal_actions/servers/data_warehouses/metadata";
import {
  DATABRICKS_SERVER_INFO,
  DATABRICKS_TOOL_STAKES,
  DATABRICKS_TOOLS,
} from "@app/lib/actions/mcp_internal_actions/servers/databricks/metadata";
import {
  DEEP_DIVE_SERVER_INFO,
  DEEP_DIVE_TOOLS,
} from "@app/lib/actions/mcp_internal_actions/servers/deep_dive/metadata";
import {
  FILE_GENERATION_SERVER_INFO,
  FILE_GENERATION_TOOLS,
} from "@app/lib/actions/mcp_internal_actions/servers/file_generation/metadata";
import {
  FRESHSERVICE_SERVER_INFO,
  FRESHSERVICE_TOOL_STAKES,
  FRESHSERVICE_TOOLS,
} from "@app/lib/actions/mcp_internal_actions/servers/freshservice/metadata";
import {
  FRONT_SERVER_INFO,
  FRONT_TOOL_STAKES,
  FRONT_TOOLS,
} from "@app/lib/actions/mcp_internal_actions/servers/front/metadata";
import {
  GITHUB_SERVER_INFO,
  GITHUB_TOOL_STAKES,
  GITHUB_TOOLS,
} from "@app/lib/actions/mcp_internal_actions/servers/github/metadata";
import {
  GMAIL_SERVER_INFO,
  GMAIL_TOOL_STAKES,
  GMAIL_TOOLS,
} from "@app/lib/actions/mcp_internal_actions/servers/gmail/metadata";
import {
  GOOGLE_CALENDAR_SERVER_INFO,
  GOOGLE_CALENDAR_TOOL_STAKES,
  GOOGLE_CALENDAR_TOOLS,
} from "@app/lib/actions/mcp_internal_actions/servers/google_calendar/metadata";
import {
  GOOGLE_DRIVE_SERVER_INFO,
  GOOGLE_DRIVE_TOOL_STAKES,
  GOOGLE_DRIVE_TOOLS,
} from "@app/lib/actions/mcp_internal_actions/servers/google_drive/metadata";
import {
  GOOGLE_SHEETS_SERVER_INFO,
  GOOGLE_SHEETS_TOOL_STAKES,
  GOOGLE_SHEETS_TOOLS,
} from "@app/lib/actions/mcp_internal_actions/servers/google_sheets/metadata";
import {
  HTTP_CLIENT_SERVER_INFO,
  HTTP_CLIENT_TOOL_STAKES,
  HTTP_CLIENT_TOOLS,
} from "@app/lib/actions/mcp_internal_actions/servers/http_client/metadata";
import {
  HUBSPOT_SERVER_INFO,
  HUBSPOT_TOOL_STAKES,
  HUBSPOT_TOOLS,
} from "@app/lib/actions/mcp_internal_actions/servers/hubspot/metadata";
import { IMAGE_GENERATION_SERVER_INFO } from "@app/lib/actions/mcp_internal_actions/servers/image_generation/metadata";
import { INCLUDE_DATA_SERVER_INFO } from "@app/lib/actions/mcp_internal_actions/servers/include_data/metadata";
import { INTERACTIVE_CONTENT_SERVER_INFO } from "@app/lib/actions/mcp_internal_actions/servers/interactive_content/metadata";
import {
  JIRA_SERVER_INFO,
  JIRA_TOOL_STAKES,
  JIRA_TOOLS,
} from "@app/lib/actions/mcp_internal_actions/servers/jira/metadata";
import { JIT_TESTING_SERVER_INFO } from "@app/lib/actions/mcp_internal_actions/servers/jit_testing/metadata";
import {
  MICROSOFT_DRIVE_SERVER_INFO,
  MICROSOFT_DRIVE_TOOL_STAKES,
  MICROSOFT_DRIVE_TOOLS,
} from "@app/lib/actions/mcp_internal_actions/servers/microsoft/microsoft_drive_metadata";
import {
  MICROSOFT_EXCEL_SERVER_INFO,
  MICROSOFT_EXCEL_TOOL_STAKES,
  MICROSOFT_EXCEL_TOOLS,
} from "@app/lib/actions/mcp_internal_actions/servers/microsoft_excel/metadata";
import {
  MICROSOFT_TEAMS_SERVER_INFO,
  MICROSOFT_TEAMS_TOOL_STAKES,
  MICROSOFT_TEAMS_TOOLS,
} from "@app/lib/actions/mcp_internal_actions/servers/microsoft_teams/metadata";
import {
  MISSING_ACTION_CATCHER_SERVER_INFO,
  MISSING_ACTION_CATCHER_TOOLS,
} from "@app/lib/actions/mcp_internal_actions/servers/missing_action_catcher/metadata";
import {
  MONDAY_SERVER_INFO,
  MONDAY_TOOL_STAKES,
  MONDAY_TOOLS,
} from "@app/lib/actions/mcp_internal_actions/servers/monday/metadata";
import {
  NOTION_SERVER_INFO,
  NOTION_TOOL_STAKES,
  NOTION_TOOLS,
} from "@app/lib/actions/mcp_internal_actions/servers/notion/metadata";
import {
  OPENAI_USAGE_SERVER_INFO,
  OPENAI_USAGE_TOOL_STAKES,
  OPENAI_USAGE_TOOLS,
} from "@app/lib/actions/mcp_internal_actions/servers/openai_usage/metadata";
import {
  OUTLOOK_CALENDAR_SERVER_INFO,
  OUTLOOK_CALENDAR_TOOL_STAKES,
  OUTLOOK_CALENDAR_TOOLS,
  OUTLOOK_SERVER_INFO,
  OUTLOOK_TOOL_STAKES,
  OUTLOOK_TOOLS,
} from "@app/lib/actions/mcp_internal_actions/servers/outlook/metadata";
import { PRIMITIVE_TYPES_DEBUGGER_SERVER_INFO } from "@app/lib/actions/mcp_internal_actions/servers/primitive_types_debugger/metadata";
import {
  EXTRACT_DATA_SERVER_INFO,
  EXTRACT_DATA_TOOLS,
} from "@app/lib/actions/mcp_internal_actions/servers/process/metadata";
export {
  FIND_TAGS_TOOL_NAME,
  PROCESS_TOOL_NAME,
} from "@app/lib/actions/mcp_internal_actions/servers/process/metadata";
import {
  PRODUCTBOARD_SERVER_INFO,
  PRODUCTBOARD_TOOL_STAKES,
  PRODUCTBOARD_TOOLS,
} from "@app/lib/actions/mcp_internal_actions/servers/productboard/metadata";
import {
  PROJECT_CONTEXT_MANAGEMENT_SERVER_INFO,
  PROJECT_CONTEXT_MANAGEMENT_TOOLS,
} from "@app/lib/actions/mcp_internal_actions/servers/project_context_management/metadata";
import { RUN_AGENT_SERVER_INFO } from "@app/lib/actions/mcp_internal_actions/servers/run_agent/metadata";
import { RUN_DUST_APP_SERVER_INFO } from "@app/lib/actions/mcp_internal_actions/servers/run_dust_app/metadata";
import {
  SALESFORCE_SERVER_INFO,
  SALESFORCE_TOOL_STAKES,
  SALESFORCE_TOOLS,
} from "@app/lib/actions/mcp_internal_actions/servers/salesforce/metadata";
import {
  SALESLOFT_SERVER_INFO,
  SALESLOFT_TOOL_STAKES,
  SALESLOFT_TOOLS,
} from "@app/lib/actions/mcp_internal_actions/servers/salesloft/metadata";
import {
  SCHEDULES_MANAGEMENT_SERVER_INFO,
  SCHEDULES_MANAGEMENT_TOOL_STAKES,
  SCHEDULES_MANAGEMENT_TOOLS,
} from "@app/lib/actions/mcp_internal_actions/servers/schedules_management/metadata";
import {
  SEARCH_SERVER_INFO,
  SEARCH_TOOLS,
} from "@app/lib/actions/mcp_internal_actions/servers/search/metadata";
export { SEARCH_TOOL_NAME } from "@app/lib/actions/mcp_internal_actions/servers/search/metadata";
import { SKILL_MANAGEMENT_SERVER_INFO } from "@app/lib/actions/mcp_internal_actions/servers/skill_management/metadata";
import {
  SLAB_SERVER_INFO,
  SLAB_TOOL_STAKES,
  SLAB_TOOLS,
} from "@app/lib/actions/mcp_internal_actions/servers/slab/metadata";
import {
  SLACK_SERVER_INFO,
  SLACK_TOOL_STAKES,
  SLACK_TOOLS,
} from "@app/lib/actions/mcp_internal_actions/servers/slack/metadata";
import {
  SLACK_BOT_SERVER_INFO,
  SLACK_BOT_TOOL_STAKES,
  SLACK_BOT_TOOLS,
} from "@app/lib/actions/mcp_internal_actions/servers/slack_bot/metadata";
import {
  SLIDESHOW_SERVER_INFO,
  SLIDESHOW_TOOLS,
} from "@app/lib/actions/mcp_internal_actions/servers/slideshow/metadata";
import {
  SOUND_STUDIO_SERVER_INFO,
  SOUND_STUDIO_TOOL_STAKES,
  SOUND_STUDIO_TOOLS,
} from "@app/lib/actions/mcp_internal_actions/servers/sound_studio/metadata";
import {
  SPEECH_GENERATOR_SERVER_INFO,
  SPEECH_GENERATOR_TOOL_STAKES,
  SPEECH_GENERATOR_TOOLS,
} from "@app/lib/actions/mcp_internal_actions/servers/speech_generator/metadata";
import {
  TABLES_QUERY_SERVER_INFO,
  TABLES_QUERY_TOOLS,
} from "@app/lib/actions/mcp_internal_actions/servers/tables_query/metadata";
export {
  EXECUTE_DATABASE_QUERY_TOOL_NAME,
  GET_DATABASE_SCHEMA_TOOL_NAME,
} from "@app/lib/actions/mcp_internal_actions/servers/tables_query/metadata";
import {
  TOOLSETS_SERVER_INFO,
  TOOLSETS_TOOLS,
} from "@app/lib/actions/mcp_internal_actions/servers/toolsets/metadata";
import {
  VALTOWN_SERVER_INFO,
  VALTOWN_TOOL_STAKES,
  VALTOWN_TOOLS,
} from "@app/lib/actions/mcp_internal_actions/servers/valtown/metadata";
import {
  VANTA_SERVER_INFO,
  VANTA_TOOL_STAKES,
  VANTA_TOOLS,
} from "@app/lib/actions/mcp_internal_actions/servers/vanta/metadata";
import {
  WEBTOOLS_SERVER_INFO,
  WEBTOOLS_TOOLS,
} from "@app/lib/actions/mcp_internal_actions/servers/webtools/metadata";
export {
  WEBBROWSER_TOOL_NAME,
  WEBSEARCH_TOOL_NAME,
} from "@app/lib/actions/mcp_internal_actions/servers/webtools/metadata";
import {
  ZENDESK_SERVER_INFO,
  ZENDESK_TOOL_STAKES,
  ZENDESK_TOOLS,
} from "@app/lib/actions/mcp_internal_actions/servers/zendesk/metadata";
import type {
  InternalMCPServerDefinitionType,
  MCPToolRetryPolicyType,
  MCPToolType,
} from "@app/lib/api/mcp";
import { getResourceNameAndIdFromSId } from "@app/lib/resources/string_ids";
import type {
  ModelId,
  PlanType,
  Result,
  WhitelistableFeature,
} from "@app/types";
import { Err, Ok } from "@app/types";

export const ADVANCED_SEARCH_SWITCH = "advanced_search";
export const USE_SUMMARY_SWITCH = "useSummary";

export const INCLUDE_TOOL_NAME = "retrieve_recent_documents";

export const QUERY_TABLES_TOOL_NAME = "query_tables";

export const CREATE_AGENT_TOOL_NAME = "create_agent";
export const FILESYSTEM_CAT_TOOL_NAME = "cat";
export const FILESYSTEM_FIND_TOOL_NAME = "find";
export const FILESYSTEM_LOCATE_IN_TREE_TOOL_NAME = "locate_in_tree";
export const FILESYSTEM_LIST_TOOL_NAME = "list";

export const AGENT_MEMORY_RETRIEVE_TOOL_NAME = "retrieve";
export const AGENT_MEMORY_RECORD_TOOL_NAME = "record_entries";
export const AGENT_MEMORY_ERASE_TOOL_NAME = "erase_entries";
export const AGENT_MEMORY_EDIT_TOOL_NAME = "edit_entries";
export const AGENT_MEMORY_COMPACT_TOOL_NAME = "compact_memory";

export const TOOLSETS_ENABLE_TOOL_NAME = "enable";
export const TOOLSETS_LIST_TOOL_NAME = "list";

export const SKILL_MANAGEMENT_SERVER_NAME = "skill_management";

export const GENERATE_IMAGE_TOOL_NAME = "generate_image";
export const EDIT_IMAGE_TOOL_NAME = "edit_image";

export const SEARCH_SERVER_NAME = "search";

export const TABLE_QUERY_V2_SERVER_NAME = "query_tables_v2"; // Do not change the name until we fixed the extension
export const DATA_WAREHOUSE_SERVER_NAME = "data_warehouses";
export const AGENT_MEMORY_SERVER_NAME = "agent_memory";

// IDs of internal MCP servers that are no longer present.
// We need to keep them to avoid breaking previous output that might reference sId that mapped to these servers.
export const LEGACY_INTERNAL_MCP_SERVER_IDS: number[] = [4];

export const AVAILABLE_INTERNAL_MCP_SERVER_NAMES = [
  // Note:
  // Names should reflect the purpose of the server but not directly the tools it contains.
  // We'll prefix all tools with the server name to avoid conflicts.
  // It's okay to change the name of the server as we don't refer to it directly.
  "agent_management",
  AGENT_MEMORY_SERVER_NAME,
  "agent_router",
  "ashby",
  "confluence",
  "conversation_files",
  "databricks",
  "data_sources_file_system",
  DATA_WAREHOUSE_SERVER_NAME,
  "deep_dive",
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
  "sound_studio",
  "speech_generator",
  "toolsets",
  "val_town",
  "vanta",
  "front",
  "web_search_&_browse",
  "zendesk",
  SEARCH_SERVER_NAME,
  TABLE_QUERY_V2_SERVER_NAME,
  "skill_management",
  "schedules_management",
  "project_context_management",
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
    tools_stakes: GITHUB_TOOL_STAKES,
    tools_arguments_requiring_approval: undefined,
    tools_retry_policies: undefined,
    timeoutMs: undefined,
    tools: GITHUB_TOOLS,
    serverInfo: GITHUB_SERVER_INFO,
  },
  image_generation: {
    id: 2,
    availability: "auto",
    allowMultipleInstances: false,
    isRestricted: undefined,
    isPreview: false,
    tools_stakes: undefined,
    tools_arguments_requiring_approval: undefined,
    tools_retry_policies: undefined,
    timeoutMs: undefined,
    serverInfo: IMAGE_GENERATION_SERVER_INFO,
  },
  file_generation: {
    id: 3,
    availability: "auto",
    allowMultipleInstances: false,
    isRestricted: undefined,
    isPreview: false,
    tools_stakes: undefined,
    tools_arguments_requiring_approval: undefined,
    tools_retry_policies: undefined,
    timeoutMs: undefined,
    tools: FILE_GENERATION_TOOLS,
    serverInfo: FILE_GENERATION_SERVER_INFO,
  },
  [DEFAULT_WEBSEARCH_ACTION_NAME]: {
    id: 5,
    availability: "auto",
    allowMultipleInstances: false,
    isRestricted: undefined,
    isPreview: false,
    tools_stakes: undefined,
    tools_arguments_requiring_approval: undefined,
    tools_retry_policies: { default: "retry_on_interrupt" },
    timeoutMs: undefined,
    tools: WEBTOOLS_TOOLS,
    serverInfo: WEBTOOLS_SERVER_INFO,
  },
  hubspot: {
    id: 7,
    availability: "manual",
    allowMultipleInstances: true,
    isRestricted: undefined,
    isPreview: false,
    tools_stakes: HUBSPOT_TOOL_STAKES,
    tools_arguments_requiring_approval: undefined,
    tools_retry_policies: undefined,
    timeoutMs: undefined,
    tools: HUBSPOT_TOOLS,
    serverInfo: HUBSPOT_SERVER_INFO,
  },
  [DEFAULT_AGENT_ROUTER_ACTION_NAME]: {
    id: 8,
    availability: "auto_hidden_builder",
    allowMultipleInstances: false,
    isRestricted: undefined,
    isPreview: false,
    tools_stakes: undefined,
    tools_arguments_requiring_approval: undefined,
    tools_retry_policies: undefined,
    timeoutMs: undefined,
    tools: AGENT_ROUTER_TOOLS,
    serverInfo: AGENT_ROUTER_SERVER_INFO,
  },
  include_data: {
    id: 9,
    availability: "auto",
    allowMultipleInstances: false,
    isRestricted: undefined,
    isPreview: false,
    tools_stakes: undefined,
    tools_arguments_requiring_approval: undefined,
    tools_retry_policies: { default: "retry_on_interrupt" },
    timeoutMs: undefined,
    serverInfo: INCLUDE_DATA_SERVER_INFO,
  },
  run_dust_app: {
    id: 10,
    availability: "auto",
    allowMultipleInstances: true,
    isRestricted: ({ featureFlags }) => {
      return !featureFlags.includes("legacy_dust_apps");
    },
    isPreview: false,
    tools_stakes: undefined,
    tools_arguments_requiring_approval: undefined,
    tools_retry_policies: undefined,
    timeoutMs: undefined,
    serverInfo: RUN_DUST_APP_SERVER_INFO,
  },
  notion: {
    id: 11,
    availability: "manual",
    allowMultipleInstances: true,
    isRestricted: undefined,
    isPreview: false,
    tools_stakes: NOTION_TOOL_STAKES,
    tools_arguments_requiring_approval: undefined,
    tools_retry_policies: undefined,
    timeoutMs: undefined,
    tools: NOTION_TOOLS,
    serverInfo: NOTION_SERVER_INFO,
  },
  extract_data: {
    id: 12,
    availability: "auto",
    allowMultipleInstances: false,
    isRestricted: undefined,
    isPreview: false,
    tools_stakes: undefined,
    tools_arguments_requiring_approval: undefined,
    tools_retry_policies: { default: "retry_on_interrupt" },
    timeoutMs: undefined,
    tools: EXTRACT_DATA_TOOLS,
    serverInfo: EXTRACT_DATA_SERVER_INFO,
  },
  missing_action_catcher: {
    id: 13,
    availability: "auto_hidden_builder",
    allowMultipleInstances: false,
    isRestricted: undefined,
    isPreview: false,
    tools_stakes: undefined,
    tools_arguments_requiring_approval: undefined,
    tools_retry_policies: undefined,
    timeoutMs: undefined,
    tools: MISSING_ACTION_CATCHER_TOOLS,
    serverInfo: MISSING_ACTION_CATCHER_SERVER_INFO,
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
    tools_stakes: SALESFORCE_TOOL_STAKES,
    tools_arguments_requiring_approval: undefined,
    tools_retry_policies: undefined,
    timeoutMs: undefined,
    tools: SALESFORCE_TOOLS,
    serverInfo: SALESFORCE_SERVER_INFO,
  },
  gmail: {
    id: 15,
    availability: "manual",
    allowMultipleInstances: true,
    isRestricted: undefined,
    isPreview: false,
    tools_stakes: GMAIL_TOOL_STAKES,
    tools_arguments_requiring_approval: undefined,
    tools_retry_policies: undefined,
    timeoutMs: undefined,
    tools: GMAIL_TOOLS,
    serverInfo: GMAIL_SERVER_INFO,
  },
  google_calendar: {
    id: 16,
    availability: "manual",
    allowMultipleInstances: true,
    isRestricted: undefined,
    isPreview: false,
    tools_arguments_requiring_approval: undefined,
    tools_stakes: GOOGLE_CALENDAR_TOOL_STAKES,
    tools_retry_policies: undefined,
    timeoutMs: undefined,
    tools: GOOGLE_CALENDAR_TOOLS,
    serverInfo: GOOGLE_CALENDAR_SERVER_INFO,
  },
  conversation_files: {
    id: 17,
    availability: "auto_hidden_builder",
    allowMultipleInstances: false,
    isRestricted: undefined,
    isPreview: false,
    tools_stakes: undefined,
    tools_arguments_requiring_approval: undefined,
    tools_retry_policies: undefined,
    timeoutMs: undefined,
    tools: CONVERSATION_FILES_TOOLS,
    serverInfo: CONVERSATION_FILES_SERVER_INFO,
  },
  slack: {
    id: 18,
    availability: "manual",
    allowMultipleInstances: true,
    isRestricted: undefined,
    isPreview: false,
    tools_stakes: SLACK_TOOL_STAKES,
    tools_arguments_requiring_approval: undefined,
    tools_retry_policies: undefined,
    timeoutMs: undefined,
    tools: SLACK_TOOLS,
    serverInfo: SLACK_SERVER_INFO,
  },
  google_sheets: {
    id: 19,
    availability: "manual",
    allowMultipleInstances: true,
    isRestricted: ({ featureFlags }) => {
      return !featureFlags.includes("google_sheets_tool");
    },
    isPreview: true,
    tools_stakes: GOOGLE_SHEETS_TOOL_STAKES,
    tools_arguments_requiring_approval: undefined,
    tools_retry_policies: undefined,
    timeoutMs: undefined,
    tools: GOOGLE_SHEETS_TOOLS,
    serverInfo: GOOGLE_SHEETS_SERVER_INFO,
  },
  monday: {
    id: 20,
    availability: "manual",
    allowMultipleInstances: true,
    isRestricted: ({ featureFlags }) => {
      return !featureFlags.includes("monday_tool");
    },
    isPreview: true,
    tools_stakes: MONDAY_TOOL_STAKES,
    tools_arguments_requiring_approval: undefined,
    tools_retry_policies: undefined,
    timeoutMs: undefined,
    tools: MONDAY_TOOLS,
    serverInfo: MONDAY_SERVER_INFO,
  },
  [AGENT_MEMORY_SERVER_NAME]: {
    id: 21,
    availability: "auto",
    allowMultipleInstances: false,
    isRestricted: undefined,
    isPreview: false,
    tools_stakes: undefined,
    tools_arguments_requiring_approval: undefined,
    tools_retry_policies: undefined,
    timeoutMs: undefined,
    tools: AGENT_MEMORY_TOOLS,
    serverInfo: AGENT_MEMORY_SERVER_INFO,
  },
  jira: {
    id: 22,
    availability: "manual",
    allowMultipleInstances: true,
    isRestricted: undefined,
    isPreview: false,
    tools_stakes: JIRA_TOOL_STAKES,
    tools_arguments_requiring_approval: undefined,
    tools_retry_policies: undefined,
    timeoutMs: undefined,
    tools: JIRA_TOOLS,
    serverInfo: JIRA_SERVER_INFO,
  },
  interactive_content: {
    id: 23,
    availability: "auto",
    allowMultipleInstances: false,
    isRestricted: undefined,
    isPreview: false,
    tools_stakes: undefined,
    tools_arguments_requiring_approval: undefined,
    tools_retry_policies: undefined,
    timeoutMs: undefined,
    serverInfo: INTERACTIVE_CONTENT_SERVER_INFO,
  },
  outlook: {
    id: 24,
    availability: "manual",
    allowMultipleInstances: true,
    isRestricted: undefined,
    isPreview: false,
    tools_stakes: OUTLOOK_TOOL_STAKES,
    tools_arguments_requiring_approval: undefined,
    tools_retry_policies: undefined,
    timeoutMs: undefined,
    tools: OUTLOOK_TOOLS,
    serverInfo: OUTLOOK_SERVER_INFO,
  },
  outlook_calendar: {
    id: 25,
    availability: "manual",
    allowMultipleInstances: true,
    isRestricted: undefined,
    isPreview: false,
    tools_stakes: OUTLOOK_CALENDAR_TOOL_STAKES,
    tools_arguments_requiring_approval: undefined,
    tools_retry_policies: undefined,
    timeoutMs: undefined,
    tools: OUTLOOK_CALENDAR_TOOLS,
    serverInfo: OUTLOOK_CALENDAR_SERVER_INFO,
  },
  freshservice: {
    id: 26,
    availability: "manual",
    allowMultipleInstances: true,
    isRestricted: undefined,
    isPreview: false,
    tools_stakes: FRESHSERVICE_TOOL_STAKES,
    tools_arguments_requiring_approval: undefined,
    tools_retry_policies: undefined,
    timeoutMs: undefined,
    tools: FRESHSERVICE_TOOLS,
    serverInfo: FRESHSERVICE_SERVER_INFO,
  },
  google_drive: {
    id: 27,
    availability: "manual",
    allowMultipleInstances: true,
    isRestricted: undefined,
    isPreview: false,
    tools_stakes: GOOGLE_DRIVE_TOOL_STAKES,
    tools_arguments_requiring_approval: undefined,
    tools_retry_policies: { default: "retry_on_interrupt" },
    timeoutMs: undefined,
    tools: GOOGLE_DRIVE_TOOLS,
    serverInfo: GOOGLE_DRIVE_SERVER_INFO,
  },
  slideshow: {
    id: 28,
    availability: "auto",
    allowMultipleInstances: false,
    isRestricted: ({ featureFlags }) => {
      return !featureFlags.includes("slideshow");
    },
    isPreview: true,
    tools_stakes: undefined,
    tools_arguments_requiring_approval: undefined,
    tools_retry_policies: undefined,
    timeoutMs: undefined,
    tools: SLIDESHOW_TOOLS,
    serverInfo: SLIDESHOW_SERVER_INFO,
  },
  deep_dive: {
    id: 29,
    availability: "auto",
    isRestricted: ({ isDeepDiveDisabled }) => isDeepDiveDisabled,
    allowMultipleInstances: false,
    isPreview: false,
    tools_stakes: undefined,
    tools_arguments_requiring_approval: undefined,
    tools_retry_policies: undefined,
    timeoutMs: undefined,
    tools: DEEP_DIVE_TOOLS,
    serverInfo: DEEP_DIVE_SERVER_INFO,
  },
  slack_bot: {
    id: 31,
    availability: "manual",
    allowMultipleInstances: true,
    isRestricted: ({ featureFlags }) => {
      return !featureFlags.includes("slack_bot_mcp");
    },
    isPreview: true,
    tools_stakes: SLACK_BOT_TOOL_STAKES,
    tools_arguments_requiring_approval: undefined,
    tools_retry_policies: undefined,
    timeoutMs: undefined,
    tools: SLACK_BOT_TOOLS,
    serverInfo: SLACK_BOT_SERVER_INFO,
  },
  openai_usage: {
    id: 32,
    availability: "manual",
    allowMultipleInstances: false,
    isPreview: true,
    isRestricted: ({ featureFlags }) => {
      return !featureFlags.includes("openai_usage_mcp");
    },
    tools_stakes: OPENAI_USAGE_TOOL_STAKES,
    tools_arguments_requiring_approval: undefined,
    tools_retry_policies: undefined,
    timeoutMs: undefined,
    tools: OPENAI_USAGE_TOOLS,
    serverInfo: OPENAI_USAGE_SERVER_INFO,
  },
  confluence: {
    id: 33,
    availability: "manual",
    allowMultipleInstances: true,
    isRestricted: ({ featureFlags }) => {
      return !featureFlags.includes("confluence_tool");
    },
    isPreview: true,
    tools_stakes: CONFLUENCE_TOOL_STAKES,
    tools_arguments_requiring_approval: undefined,
    tools_retry_policies: undefined,
    timeoutMs: undefined,
    tools: CONFLUENCE_TOOLS,
    serverInfo: CONFLUENCE_SERVER_INFO,
  },
  speech_generator: {
    id: 34,
    availability: "auto",
    allowMultipleInstances: false,
    isRestricted: undefined,
    isPreview: false,
    tools_stakes: SPEECH_GENERATOR_TOOL_STAKES,
    tools_arguments_requiring_approval: undefined,
    tools_retry_policies: { default: "retry_on_interrupt" },
    timeoutMs: undefined,
    tools: SPEECH_GENERATOR_TOOLS,
    serverInfo: SPEECH_GENERATOR_SERVER_INFO,
  },
  microsoft_drive: {
    id: 35,
    availability: "manual",
    allowMultipleInstances: true,
    isRestricted: undefined,
    isPreview: false,
    tools_stakes: MICROSOFT_DRIVE_TOOL_STAKES,
    tools_arguments_requiring_approval: undefined,
    tools_retry_policies: undefined,
    timeoutMs: undefined,
    tools: MICROSOFT_DRIVE_TOOLS,
    serverInfo: MICROSOFT_DRIVE_SERVER_INFO,
  },
  microsoft_teams: {
    id: 36,
    availability: "manual",
    allowMultipleInstances: true,
    isRestricted: undefined,
    isPreview: false,
    tools_stakes: MICROSOFT_TEAMS_TOOL_STAKES,
    tools_arguments_requiring_approval: undefined,
    tools_retry_policies: undefined,
    timeoutMs: undefined,
    tools: MICROSOFT_TEAMS_TOOLS,
    serverInfo: MICROSOFT_TEAMS_SERVER_INFO,
  },
  sound_studio: {
    id: 37,
    availability: "manual",
    allowMultipleInstances: false,
    isRestricted: undefined,
    isPreview: false,
    tools_stakes: SOUND_STUDIO_TOOL_STAKES,
    tools_arguments_requiring_approval: undefined,
    tools_retry_policies: { default: "retry_on_interrupt" },
    timeoutMs: undefined,
    tools: SOUND_STUDIO_TOOLS,
    serverInfo: SOUND_STUDIO_SERVER_INFO,
  },
  microsoft_excel: {
    id: 38,
    availability: "manual",
    allowMultipleInstances: true,
    isRestricted: undefined,
    isPreview: false,
    tools_stakes: MICROSOFT_EXCEL_TOOL_STAKES,
    tools_arguments_requiring_approval: undefined,
    tools_retry_policies: undefined,
    timeoutMs: undefined,
    tools: MICROSOFT_EXCEL_TOOLS,
    serverInfo: MICROSOFT_EXCEL_SERVER_INFO,
  },
  http_client: {
    id: 39,
    availability: "manual",
    allowMultipleInstances: false,
    isRestricted: ({ featureFlags }) => {
      return !featureFlags.includes("http_client_tool");
    },
    isPreview: true,
    tools_stakes: HTTP_CLIENT_TOOL_STAKES,
    tools_arguments_requiring_approval: undefined,
    tools_retry_policies: undefined,
    timeoutMs: undefined,
    tools: HTTP_CLIENT_TOOLS,
    serverInfo: HTTP_CLIENT_SERVER_INFO,
  },
  ashby: {
    id: 40,
    availability: "manual",
    allowMultipleInstances: false,
    isRestricted: ({ featureFlags }) => {
      return !featureFlags.includes("ashby_tool");
    },
    isPreview: true,
    tools_stakes: ASHBY_TOOL_STAKES,
    tools_arguments_requiring_approval: undefined,
    tools_retry_policies: undefined,
    timeoutMs: undefined,
    tools: ASHBY_TOOLS,
    serverInfo: ASHBY_SERVER_INFO,
  },
  salesloft: {
    id: 41,
    availability: "manual",
    allowMultipleInstances: false,
    isRestricted: ({ featureFlags }) => {
      return !featureFlags.includes("salesloft_tool");
    },
    isPreview: true,
    tools_stakes: SALESLOFT_TOOL_STAKES,
    tools_arguments_requiring_approval: undefined,
    tools_retry_policies: undefined,
    timeoutMs: undefined,
    tools: SALESLOFT_TOOLS,
    serverInfo: SALESLOFT_SERVER_INFO,
  },
  zendesk: {
    id: 42,
    availability: "manual",
    allowMultipleInstances: true,
    isRestricted: undefined,
    isPreview: false,
    tools_stakes: ZENDESK_TOOL_STAKES,
    tools_arguments_requiring_approval: undefined,
    tools_retry_policies: undefined,
    timeoutMs: undefined,
    tools: ZENDESK_TOOLS,
    serverInfo: ZENDESK_SERVER_INFO,
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
    tools_stakes: SLAB_TOOL_STAKES,
    tools_arguments_requiring_approval: undefined,
    tools_retry_policies: undefined,
    timeoutMs: undefined,
    tools: SLAB_TOOLS,
    serverInfo: SLAB_SERVER_INFO,
  },
  vanta: {
    id: 44,
    availability: "manual",
    allowMultipleInstances: true,
    isRestricted: undefined,
    isPreview: false,
    tools_stakes: VANTA_TOOL_STAKES,
    tools_arguments_requiring_approval: undefined,
    tools_retry_policies: undefined,
    timeoutMs: undefined,
    tools: VANTA_TOOLS,
    serverInfo: VANTA_SERVER_INFO,
  },
  primitive_types_debugger: {
    id: 1004,
    availability: "manual",
    allowMultipleInstances: false,
    isPreview: false,
    isRestricted: ({ featureFlags }) => {
      return !featureFlags.includes("dev_mcp_actions");
    },
    tools_stakes: undefined,
    tools_arguments_requiring_approval: undefined,
    tools_retry_policies: undefined,
    timeoutMs: undefined,
    serverInfo: PRIMITIVE_TYPES_DEBUGGER_SERVER_INFO,
  },
  [SEARCH_SERVER_NAME]: {
    id: 1006,
    availability: "auto",
    allowMultipleInstances: false,
    isRestricted: undefined,
    isPreview: false,
    tools_stakes: undefined,
    tools_arguments_requiring_approval: undefined,
    tools_retry_policies: { default: "retry_on_interrupt" },
    timeoutMs: undefined,
    tools: SEARCH_TOOLS,
    serverInfo: SEARCH_SERVER_INFO,
  },
  run_agent: {
    id: 1008,
    availability: "auto",
    allowMultipleInstances: true,
    isRestricted: undefined,
    isPreview: false,
    tools_stakes: undefined,
    tools_arguments_requiring_approval: undefined,
    tools_retry_policies: { default: "retry_on_interrupt" },
    timeoutMs: DEFAULT_MCP_REQUEST_TIMEOUT_MS,
    serverInfo: RUN_AGENT_SERVER_INFO,
  },
  [TABLE_QUERY_V2_SERVER_NAME]: {
    id: 1009,
    availability: "auto",
    allowMultipleInstances: false,
    isRestricted: undefined,
    isPreview: false,
    tools_stakes: undefined,
    tools_arguments_requiring_approval: undefined,
    tools_retry_policies: undefined,
    timeoutMs: undefined,
    tools: TABLES_QUERY_TOOLS,
    serverInfo: TABLES_QUERY_SERVER_INFO,
  },
  data_sources_file_system: {
    id: 1010,
    // This server is hidden for everyone, it is only available through the search tool
    // when the advanced_search mode is enabled.
    availability: "auto_hidden_builder",
    allowMultipleInstances: false,
    isRestricted: undefined,
    isPreview: false,
    tools_stakes: undefined,
    tools_arguments_requiring_approval: undefined,
    tools_retry_policies: undefined,
    timeoutMs: undefined,
    serverInfo: DATA_SOURCES_FILE_SYSTEM_SERVER_INFO,
  },
  agent_management: {
    id: 1011,
    availability: "auto",
    allowMultipleInstances: false,
    isPreview: false,
    isRestricted: ({ featureFlags }) => {
      return !featureFlags.includes("agent_management_tool");
    },
    tools_stakes: AGENT_MANAGEMENT_TOOL_STAKES,
    tools_arguments_requiring_approval: undefined,
    tools_retry_policies: undefined,
    timeoutMs: undefined,
    tools: AGENT_MANAGEMENT_TOOLS,
    serverInfo: AGENT_MANAGEMENT_SERVER_INFO,
  },
  [DATA_WAREHOUSE_SERVER_NAME]: {
    id: 1012,
    availability: "auto_hidden_builder",
    allowMultipleInstances: false,
    isPreview: false,
    isRestricted: undefined,
    tools_stakes: undefined,
    tools_arguments_requiring_approval: undefined,
    tools_retry_policies: undefined,
    timeoutMs: undefined,
    tools: DATA_WAREHOUSES_TOOLS,
    serverInfo: DATA_WAREHOUSES_SERVER_INFO,
  },
  toolsets: {
    id: 1013,
    availability: "auto_hidden_builder",
    allowMultipleInstances: false,
    isPreview: false,
    isRestricted: undefined,
    tools_stakes: undefined,
    tools_arguments_requiring_approval: undefined,
    tools_retry_policies: undefined,
    timeoutMs: undefined,
    tools: TOOLSETS_TOOLS,
    serverInfo: TOOLSETS_SERVER_INFO,
  },
  val_town: {
    id: 1014,
    availability: "manual",
    allowMultipleInstances: false,
    isPreview: false,
    isRestricted: undefined,
    tools_stakes: VALTOWN_TOOL_STAKES,
    tools_arguments_requiring_approval: undefined,
    tools_retry_policies: undefined,
    timeoutMs: undefined,
    tools: VALTOWN_TOOLS,
    serverInfo: VALTOWN_SERVER_INFO,
  },
  jit_testing: {
    id: 1016,
    availability: "manual",
    allowMultipleInstances: false,
    isPreview: false,
    isRestricted: ({ featureFlags }) => {
      return !featureFlags.includes("dev_mcp_actions");
    },
    tools_stakes: undefined,
    tools_arguments_requiring_approval: undefined,
    tools_retry_policies: undefined,
    timeoutMs: undefined,
    serverInfo: JIT_TESTING_SERVER_INFO,
  },
  common_utilities: {
    id: 1017,
    availability: "auto_hidden_builder",
    allowMultipleInstances: false,
    isPreview: false,
    isRestricted: undefined,
    tools_stakes: undefined,
    tools_arguments_requiring_approval: undefined,
    tools_retry_policies: undefined,
    timeoutMs: undefined,
    tools: COMMON_UTILITIES_TOOLS,
    serverInfo: COMMON_UTILITIES_SERVER_INFO,
  },
  front: {
    id: 1018,
    availability: "manual",
    allowMultipleInstances: false,
    isRestricted: ({ featureFlags }) => {
      return !featureFlags.includes("front_tool");
    },
    isPreview: true,
    tools_stakes: FRONT_TOOL_STAKES,
    tools_arguments_requiring_approval: undefined,
    tools_retry_policies: { default: "retry_on_interrupt" },
    timeoutMs: undefined,
    tools: FRONT_TOOLS,
    serverInfo: FRONT_SERVER_INFO,
  },
  skill_management: {
    id: 1019,
    availability: "auto_hidden_builder",
    allowMultipleInstances: false,
    isPreview: false,
    isRestricted: ({ featureFlags }) => {
      return !featureFlags.includes("skills");
    },
    tools_stakes: undefined,
    tools_arguments_requiring_approval: undefined,
    tools_retry_policies: undefined,
    timeoutMs: undefined,
    serverInfo: SKILL_MANAGEMENT_SERVER_INFO,
  },
  schedules_management: {
    id: 1020,
    availability: "auto_hidden_builder",
    allowMultipleInstances: false,
    isPreview: false,
    isRestricted: undefined,
    tools_stakes: SCHEDULES_MANAGEMENT_TOOL_STAKES,
    tools_arguments_requiring_approval: undefined,
    tools_retry_policies: undefined,
    timeoutMs: undefined,
    tools: SCHEDULES_MANAGEMENT_TOOLS,
    serverInfo: SCHEDULES_MANAGEMENT_SERVER_INFO,
  },
  project_context_management: {
    id: 1021,
    availability: "auto_hidden_builder",
    allowMultipleInstances: false,
    isPreview: false,
    isRestricted: ({ featureFlags }) => {
      return !featureFlags.includes("projects");
    },
    tools_stakes: {
      list_project_files: "never_ask",
      add_project_file: "high",
      update_project_file: "high",
      delete_project_file: "high",
    },
    tools_arguments_requiring_approval: undefined,
    tools_retry_policies: undefined,
    timeoutMs: undefined,
    tools: PROJECT_CONTEXT_MANAGEMENT_TOOLS,
    serverInfo: PROJECT_CONTEXT_MANAGEMENT_SERVER_INFO,
  },
  databricks: {
    id: 45,
    availability: "manual",
    allowMultipleInstances: true,
    isRestricted: ({ featureFlags }) => {
      return !featureFlags.includes("databricks_tool");
    },
    isPreview: true,
    tools_stakes: DATABRICKS_TOOL_STAKES,
    tools_arguments_requiring_approval: undefined,
    tools_retry_policies: undefined,
    timeoutMs: undefined,
    tools: DATABRICKS_TOOLS,
    serverInfo: DATABRICKS_SERVER_INFO,
  },
  productboard: {
    id: 46,
    availability: "manual",
    allowMultipleInstances: true,
    isRestricted: undefined,
    isPreview: false,
    tools_stakes: PRODUCTBOARD_TOOL_STAKES,
    tools_arguments_requiring_approval: undefined,
    tools_retry_policies: undefined,
    timeoutMs: undefined,
    tools: PRODUCTBOARD_TOOLS,
    serverInfo: PRODUCTBOARD_SERVER_INFO,
  },
  // Using satisfies here instead of: type to avoid TypeScript widening the type and breaking the type inference for AutoInternalMCPServerNameType.
} satisfies {
  [K in InternalMCPServerNameType]: {
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
    tools_stakes: Record<string, MCPToolStakeLevelType> | undefined;
    // Defines which arguments require per-agent approval for "medium" stake tools.
    // When a tool has "medium" stake, the user must approve the specific combination
    // of (agent, tool, argument values) before the tool can execute.
    tools_arguments_requiring_approval: Record<string, string[]> | undefined;
    tools_retry_policies: Record<string, MCPToolRetryPolicyType> | undefined;
    timeoutMs: number | undefined;
    tools?: MCPToolType[];
    requiresBearerToken?: boolean;
    serverInfo: InternalMCPServerDefinitionType & { name: K };
  };
};

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

export const isAutoInternalMCPServerName = (
  name: InternalMCPServerNameType
): name is AutoInternalMCPServerNameType => {
  return (
    INTERNAL_MCP_SERVERS[name].availability === "auto" ||
    INTERNAL_MCP_SERVERS[name].availability === "auto_hidden_builder"
  );
};

export const getAvailabilityOfInternalMCPServerByName = (
  name: InternalMCPServerNameType
): MCPServerAvailability => {
  return INTERNAL_MCP_SERVERS[name].availability;
};

export const getAvailabilityOfInternalMCPServerById = (
  sId: string
): MCPServerAvailability => {
  const r = getInternalMCPServerNameAndWorkspaceId(sId);
  if (r.isErr()) {
    return "manual";
  }
  return getAvailabilityOfInternalMCPServerByName(r.value.name);
};

export const allowsMultipleInstancesOfInternalMCPServerByName = (
  name: InternalMCPServerNameType
): boolean => {
  return INTERNAL_MCP_SERVERS[name].allowMultipleInstances;
};

export const allowsMultipleInstancesOfInternalMCPServerById = (
  sId: string
): boolean => {
  const r = getInternalMCPServerNameAndWorkspaceId(sId);
  if (r.isErr()) {
    return false;
  }
  return !!INTERNAL_MCP_SERVERS[r.value.name].allowMultipleInstances;
};

export const getInternalMCPServerNameAndWorkspaceId = (
  sId: string
): Result<
  {
    name: InternalMCPServerNameType;
    workspaceModelId: ModelId;
  },
  Error
> => {
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
};

export const getInternalMCPServerNameFromSId = (
  sId: string | null
): InternalMCPServerNameType | null => {
  if (sId === null) {
    return null;
  }

  const r = getInternalMCPServerNameAndWorkspaceId(sId);
  if (r.isOk()) {
    return r.value.name;
  }

  return null;
};

export const getInternalMCPServerIconByName = (
  name: InternalMCPServerNameType
): InternalAllowedIconType => {
  return INTERNAL_MCP_SERVERS[name].serverInfo.icon ?? undefined;
};

export const isInternalMCPServerName = (
  name: string
): name is InternalMCPServerNameType =>
  AVAILABLE_INTERNAL_MCP_SERVER_NAMES.includes(
    name as InternalMCPServerNameType
  );

export const isValidInternalMCPServerId = (
  workspaceModelId: ModelId,
  sId: string
): boolean => {
  const r = getInternalMCPServerNameAndWorkspaceId(sId);
  if (r.isOk()) {
    return r.value.workspaceModelId === workspaceModelId;
  }

  return false;
};

export const isInternalMCPServerOfName = (
  sId: string | null,
  name: InternalMCPServerNameType
): boolean => {
  if (sId === null) {
    return false;
  }

  const r = getInternalMCPServerNameAndWorkspaceId(sId);
  if (r.isOk()) {
    return r.value.name === name;
  }

  return false;
};

/**
 * Returns the static metadata for an internal MCP server, including tools if defined.
 * This eliminates the need to connect to the server to fetch metadata.
 */
export const getInternalMCPServerStaticMetadata = (
  name: InternalMCPServerNameType
): {
  name: string;
  version: string;
  description: string;
  icon: InternalAllowedIconType;
  authorization: InternalMCPServerDefinitionType["authorization"];
  documentationUrl: string | null;
  instructions: string | null;
  developerSecretSelection?: InternalMCPServerDefinitionType["developerSecretSelection"];
  developerSecretSelectionDescription?: string;
  tools: MCPToolType[];
} => {
  const server = INTERNAL_MCP_SERVERS[name];
  const serverInfo = server.serverInfo as InternalMCPServerDefinitionType;
  return {
    name: serverInfo.name,
    version: serverInfo.version,
    description: serverInfo.description,
    icon: serverInfo.icon,
    authorization: serverInfo.authorization,
    documentationUrl: serverInfo.documentationUrl,
    instructions: serverInfo.instructions ?? null,
    developerSecretSelection: serverInfo.developerSecretSelection,
    developerSecretSelectionDescription:
      serverInfo.developerSecretSelectionDescription ?? undefined,
    tools: "tools" in server ? (server.tools ?? []) : [],
  };
};
