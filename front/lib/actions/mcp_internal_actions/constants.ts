import type { InternalAllowedIconType } from "@app/components/resources/resources_icons";
import type { MCPToolStakeLevelType } from "@app/lib/actions/constants";
import { RUN_AGENT_CALL_TOOL_TIMEOUT_MS } from "@app/lib/actions/constants";
import type {
  ServerMetadata,
  ToolMeta,
} from "@app/lib/actions/mcp_internal_actions/tool_definition";
import { ACTIVATION_RECOMMENDATIONS_SERVER } from "@app/lib/api/actions/servers/activation_recommendations/metadata";
import {
  AGENT_DELEGATION_SERVER,
  AGENT_DELEGATION_SERVER_NAME,
} from "@app/lib/api/actions/servers/agent_delegation/metadata";
import { AGENT_MEMORY_SERVER } from "@app/lib/api/actions/servers/agent_memory/metadata";
import {
  AGENT_ROUTER_SERVER,
  AGENT_ROUTER_SERVER_NAME,
} from "@app/lib/api/actions/servers/agent_router/metadata";
import { AGENT_SIDEKICK_AGENT_STATE_SERVER } from "@app/lib/api/actions/servers/agent_sidekick_agent_state/metadata";
import { AGENT_SIDEKICK_CONTEXT_SERVER } from "@app/lib/api/actions/servers/agent_sidekick_context/metadata";
import { AGENT_TEMPLATES_SERVER } from "@app/lib/api/actions/servers/agent_templates/metadata";
import { ASHBY_SERVER } from "@app/lib/api/actions/servers/ashby/metadata";
import { ASK_USER_QUESTION_SERVER } from "@app/lib/api/actions/servers/ask_user_question/metadata";
import { CLARI_COPILOT_SERVER } from "@app/lib/api/actions/servers/clari_copilot/metadata";
import { COMMON_UTILITIES_SERVER } from "@app/lib/api/actions/servers/common_utilities/metadata";
import { CONFLUENCE_SERVER } from "@app/lib/api/actions/servers/confluence/metadata";
import { CONVERSATION_FILES_SERVER } from "@app/lib/api/actions/servers/conversation_files/metadata";
import { CONVERSATION_SIDE_PANEL_SERVER } from "@app/lib/api/actions/servers/conversation_side_panel/metadata";
import { DATA_SOURCES_FILE_SYSTEM_SERVER } from "@app/lib/api/actions/servers/data_sources_file_system/metadata";
import { DATA_WAREHOUSES_SERVER } from "@app/lib/api/actions/servers/data_warehouses/metadata";
import { EXA_SERVER } from "@app/lib/api/actions/servers/exa/metadata";
import { EXTRACT_DATA_SERVER } from "@app/lib/api/actions/servers/extract_data/metadata";
import { FATHOM_SERVER } from "@app/lib/api/actions/servers/fathom/metadata";
import { FILE_GENERATION_SERVER } from "@app/lib/api/actions/servers/file_generation/metadata";
import { FILES_SERVER } from "@app/lib/api/actions/servers/files/metadata";
import { FRESHSERVICE_SERVER } from "@app/lib/api/actions/servers/freshservice/metadata";
import { FRONT_SERVER } from "@app/lib/api/actions/servers/front/metadata";
import { GITHUB_SERVER } from "@app/lib/api/actions/servers/github/metadata";
import { GMAIL_SERVER } from "@app/lib/api/actions/servers/gmail/metadata";
import { GONG_SERVER } from "@app/lib/api/actions/servers/gong/metadata";
import { GOOGLE_CALENDAR_SERVER } from "@app/lib/api/actions/servers/google_calendar/metadata";
import { GOOGLE_DRIVE_SERVER } from "@app/lib/api/actions/servers/google_drive/metadata";
import { GOOGLE_SHEETS_SERVER } from "@app/lib/api/actions/servers/google_sheets/metadata";
import { HTTP_CLIENT_SERVER } from "@app/lib/api/actions/servers/http_client/metadata";
import { HUBSPOT_SERVER } from "@app/lib/api/actions/servers/hubspot/metadata";
import { IMAGE_GENERATION_SERVER } from "@app/lib/api/actions/servers/image_generation/metadata";
import { INCLUDE_DATA_SERVER } from "@app/lib/api/actions/servers/include_data/metadata";
import { INTERACTIVE_CONTENT_SERVER } from "@app/lib/api/actions/servers/interactive_content/metadata";
import { JIRA_SERVER } from "@app/lib/api/actions/servers/jira/metadata";
import { LUMA_SERVER } from "@app/lib/api/actions/servers/luma/metadata";
import { MICROSOFT_DRIVE_SERVER } from "@app/lib/api/actions/servers/microsoft_drive/metadata";
import { MICROSOFT_EXCEL_SERVER } from "@app/lib/api/actions/servers/microsoft_excel/metadata";
import { MICROSOFT_TEAMS_SERVER } from "@app/lib/api/actions/servers/microsoft_teams/metadata";
import { MISSING_ACTION_CATCHER_SERVER } from "@app/lib/api/actions/servers/missing_action_catcher/metadata";
import { MONDAY_SERVER } from "@app/lib/api/actions/servers/monday/metadata";
import { NOTION_SERVER } from "@app/lib/api/actions/servers/notion/metadata";
import { OPENAI_USAGE_SERVER } from "@app/lib/api/actions/servers/openai_usage/metadata";
import { OUTLOOK_CALENDAR_SERVER } from "@app/lib/api/actions/servers/outlook/calendar_metadata";
import { OUTLOOK_MAIL_SERVER } from "@app/lib/api/actions/servers/outlook/mail_metadata";
import { PLAN_MODE_SERVER } from "@app/lib/api/actions/servers/plan_mode/metadata";
import { POD_MANAGER_SERVER } from "@app/lib/api/actions/servers/pod_manager/metadata";
import { POD_TASKS_SERVER } from "@app/lib/api/actions/servers/pod_tasks/metadata";
import { POKE_SERVER } from "@app/lib/api/actions/servers/poke/metadata";
import { PRODUCTBOARD_SERVER } from "@app/lib/api/actions/servers/productboard/metadata";
import {
  QUERY_TABLES_V2_SERVER,
  TABLE_QUERY_V2_SERVER_NAME,
} from "@app/lib/api/actions/servers/query_tables_v2/metadata";
import { RUN_AGENT_SERVER } from "@app/lib/api/actions/servers/run_agent/metadata";
import { RUN_DUST_APP_SERVER } from "@app/lib/api/actions/servers/run_dust_app/metadata";
import { SALESFORCE_SERVER } from "@app/lib/api/actions/servers/salesforce/metadata";
import { SALESLOFT_SERVER } from "@app/lib/api/actions/servers/salesloft/metadata";
import {
  SANDBOX_MCP_REQUEST_TIMEOUT_MS,
  SANDBOX_SERVER,
} from "@app/lib/api/actions/servers/sandbox/metadata";
import { SANDBOX_FUNCTIONS_SERVER } from "@app/lib/api/actions/servers/sandbox_functions/metadata";
import { SEARCH_SERVER } from "@app/lib/api/actions/servers/search/metadata";
import { SERVICENOW_SERVER } from "@app/lib/api/actions/servers/servicenow/metadata";
import { SHOPIFY_SERVER } from "@app/lib/api/actions/servers/shopify/metadata";
import { SKILL_AUTHORING_SERVER } from "@app/lib/api/actions/servers/skill_authoring/metadata";
import { SKILL_MANAGEMENT_SERVER } from "@app/lib/api/actions/servers/skill_management/metadata";
import { SLAB_SERVER } from "@app/lib/api/actions/servers/slab/metadata";
import { SLACK_BOT_SERVER } from "@app/lib/api/actions/servers/slack_bot/metadata";
import { SLACK_PERSONAL_SERVER } from "@app/lib/api/actions/servers/slack_personal/metadata";
import { SNOWFLAKE_SERVER } from "@app/lib/api/actions/servers/snowflake/metadata";
import { SOUND_STUDIO_SERVER } from "@app/lib/api/actions/servers/sound_studio/metadata";
import { SPEECH_GENERATOR_SERVER } from "@app/lib/api/actions/servers/speech_generator/metadata";
import { STATUSPAGE_SERVER } from "@app/lib/api/actions/servers/statuspage/metadata";
import { TOOLSETS_SERVER } from "@app/lib/api/actions/servers/toolsets/metadata";
import { TRIGGERS_MANAGEMENT_SERVER } from "@app/lib/api/actions/servers/triggers_management/metadata";
import { UKG_READY_SERVER } from "@app/lib/api/actions/servers/ukg_ready/metadata";
import { USER_ANALYTICS_SERVER } from "@app/lib/api/actions/servers/user_analytics/metadata";
import { USER_MEMORY_SERVER } from "@app/lib/api/actions/servers/user_memory/metadata";
import { USER_MENTIONS_SERVER } from "@app/lib/api/actions/servers/user_mentions/metadata";
import { VAL_TOWN_SERVER } from "@app/lib/api/actions/servers/val_town/metadata";
import { VANTA_SERVER } from "@app/lib/api/actions/servers/vanta/metadata";
import { WAKEUPS_SERVER } from "@app/lib/api/actions/servers/wakeups/metadata";
import {
  WEB_SEARCH_BROWSE_SERVER,
  WEB_SEARCH_BROWSE_SERVER_NAME,
} from "@app/lib/api/actions/servers/web_search_browse/metadata";
import {
  WORKSPACE_ANALYTICS_SERVER,
  WORKSPACE_ANALYTICS_SERVER_NAME,
} from "@app/lib/api/actions/servers/workspace_analytics/metadata";
import { WORKSPACE_MANAGEMENT_SERVER } from "@app/lib/api/actions/servers/workspace_management/metadata";
import { ZENDESK_SERVER } from "@app/lib/api/actions/servers/zendesk/metadata";
import type {
  InternalMCPServerDefinitionType,
  MCPToolRetryPolicyType,
  ToolDisplayLabels,
} from "@app/lib/api/mcp";
import { isCreditPricedPlanPrefix } from "@app/lib/plans/plan_codes";
import { getResourceNameAndIdFromSId } from "@app/lib/resources/string_ids";
import type { PlanType } from "@app/types/plan";
import type { WhitelistableFeature } from "@app/types/shared/feature_flags";
import { isComputerFeatureEnabled } from "@app/types/shared/feature_flags";
import type { ModelId } from "@app/types/shared/model_id";
import type { Result } from "@app/types/shared/result";
import { Err, Ok } from "@app/types/shared/result";
import type { JSONSchema7 as JSONSchema } from "json-schema";
import { z } from "zod";
import { zodToJsonSchema } from "zod-to-json-schema";

export const ADVANCED_SEARCH_SWITCH = "advanced_search";
export const USE_SUMMARY_SWITCH = "useSummary";

export const SEARCH_TOOL_NAME = "semantic_search";
export const INCLUDE_TOOL_NAME = "retrieve_recent_documents";
export const PROCESS_TOOL_NAME = "extract_information_from_documents";

export const WEBSEARCH_TOOL_NAME = "websearch";
export const WEBBROWSER_TOOL_NAME = "webbrowser";

export const DATA_WAREHOUSES_LIST_TOOL_NAME = "list";
export const DATA_WAREHOUSES_FIND_TOOL_NAME = "find";
export const DATA_WAREHOUSES_DESCRIBE_TABLES_TOOL_NAME = "describe_tables";
export const DATA_WAREHOUSES_QUERY_TOOL_NAME = "query";

export const TOOLSETS_ENABLE_TOOL_NAME = "enable";
export const TOOLSETS_LIST_TOOL_NAME = "list";

export const SKILL_MANAGEMENT_SERVER_NAME = "skill_management";
export const SKILL_AUTHORING_SERVER_NAME = "skill_authoring";

export const GENERATE_IMAGE_TOOL_NAME = "generate_image";

export const SEARCH_SERVER_NAME = "search";

export const DATA_WAREHOUSE_SERVER_NAME = "data_warehouses";

export const ASHBY_SERVER_NAME = "ashby";

// IDs of internal MCP servers that are no longer present.
// We need to keep them to avoid breaking previous output that might reference sId that mapped to these servers.
// 1047 was workspace_people, folded into workspace_management as list_workspace_members.
export const LEGACY_INTERNAL_MCP_SERVER_IDS: number[] = [
  // 45 (databricks) was removed in favor of the official Databricks managed MCP servers, added as
  // remote MCP server presets (see DEFAULT_REMOTE_MCP_SERVERS).
  4,
  28, 45, 1004, 1016, 1047,
];

export const AVAILABLE_INTERNAL_MCP_SERVER_NAMES = [
  // Note:
  // Names should reflect the purpose of the server but not directly the tools it contains.
  // We'll prefix all tools with the server name to avoid conflicts.
  // It's okay to change the name of the server as we don't refer to it directly.
  "user_analytics",
  "user_memory",
  "agent_sidekick_agent_state",
  "agent_sidekick_context",
  "agent_templates",
  "agent_memory",
  AGENT_DELEGATION_SERVER_NAME,
  "agent_router",
  ASHBY_SERVER_NAME,
  "clari_copilot",
  "confluence",
  "conversation_files",
  "conversation_side_panel",
  "files",
  "data_sources_file_system",
  DATA_WAREHOUSE_SERVER_NAME,
  "extract_data",
  "exa_people_and_company",
  "file_generation",
  "fathom",
  "freshservice",
  "github",
  "gmail",
  "gong",
  "google_calendar",
  "google_drive",
  "google_sheets",
  "http_client",
  "hubspot",
  "image_generation",
  "include_data",
  "interactive_content",
  "jira",
  "luma",
  "microsoft_drive",
  "microsoft_excel",
  "microsoft_teams",
  "missing_action_catcher",
  "monday",
  "notion",
  "openai_usage",
  "outlook_calendar",
  "outlook",
  "productboard",
  "common_utilities",
  "run_agent",
  "run_dust_app",
  "salesforce",
  "salesloft",
  "servicenow",
  "shopify",
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
  SKILL_AUTHORING_SERVER_NAME,
  "skill_management",
  "triggers_management",
  "pod_manager",
  "pod_tasks",
  "poke",
  "sandbox",
  "sandbox_functions",
  "ask_user_question",
  "wakeups",
  "plan_mode",
  WORKSPACE_ANALYTICS_SERVER_NAME,
  "workspace_management",
  "activation_recommendations",
] as const;

export const INTERNAL_SERVERS_WITH_WEBSEARCH = [
  "web_search_&_browse",
  "http_client",
] as const;

// Whether the server is available by default in the global space.
// Hidden servers are available by default in the global space but are not visible in the assistant builder.
export const MCP_SERVER_AVAILABILITY = [
  "manual",
  "auto",
  "auto_hidden_builder",
] as const;
export type MCPServerAvailability = (typeof MCP_SERVER_AVAILABILITY)[number];

type HasUniqueNames<Tools extends readonly ToolMeta[]> = {
  // Loop over each item in the array.
  [I in keyof Tools]: {
    // Only check the "name" property.
    [Key in keyof Tools[I]]: Key extends "name"
      ? Tools[I][Key] extends {
          // Build an array of all the other names.
          [J in keyof Tools]: J extends I ? never : Tools[J];
        }[number]["name"]
        ? // The current name (Tools[I][Key]) matches another name: we error.
          `ERROR: Duplicate tool name detected: ${Tools[I][Key] & string}`
        : // No match, we just fall through.
          Tools[I][Key]
      : // Property other than the name: we just fall through as well.
        Tools[I][Key];
  };
};

function ensureUniqueToolNames<
  const T extends {
    [K in InternalMCPServerNameType]: InternalMCPServerEntry<K>;
  },
>(
  servers: T & {
    [ServerName in InternalMCPServerNameType]: {
      metadata: {
        tools: HasUniqueNames<T[ServerName]["metadata"]["tools"]>;
      };
    };
  }
): T {
  return servers;
}

export const INTERNAL_MCP_SERVERS = ensureUniqueToolNames({
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
    isRestricted: ({ featureFlags }) =>
      !featureFlags.includes("allow_old_notion_mcp"),
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
    tools_arguments_requiring_approval: {
      create_object: ["objectName"],
      update_object: ["objectName"],
    },
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
      send_mail: ["to", "from"],
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
  conversation_side_panel: {
    id: 1044,
    availability: "auto_hidden_builder",
    allowMultipleInstances: false,
    isRestricted: undefined,
    isPreview: false,
    tools_arguments_requiring_approval: undefined,
    tools_retry_policies: undefined,
    timeoutMs: undefined,
    metadata: CONVERSATION_SIDE_PANEL_SERVER,
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
    isRestricted: undefined,
    isPreview: false,
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
      send_mail: ["to"],
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
  slack_bot: {
    id: 31,
    availability: "manual" as const,
    allowMultipleInstances: true,
    isRestricted: undefined,
    isPreview: false,
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
    requiresBearerToken: true,
    tools_arguments_requiring_approval: undefined,
    tools_retry_policies: undefined,
    timeoutMs: undefined,
    metadata: OPENAI_USAGE_SERVER,
  },
  confluence: {
    id: 33,
    availability: "manual",
    allowMultipleInstances: true,
    isRestricted: undefined,
    isPreview: false,
    tools_arguments_requiring_approval: undefined,
    tools_retry_policies: undefined,
    timeoutMs: undefined,
    metadata: CONFLUENCE_SERVER,
  },
  speech_generator: {
    id: 34,
    availability: "auto",
    allowMultipleInstances: false,
    isRestricted: ({ plan }) => plan.isByok,
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
    tools_arguments_requiring_approval: undefined,
    tools_retry_policies: undefined,
    timeoutMs: undefined,
    metadata: MICROSOFT_DRIVE_SERVER,
  },
  microsoft_teams: {
    id: 36,
    availability: "manual",
    allowMultipleInstances: true,
    isRestricted: undefined,
    isPreview: false,
    tools_arguments_requiring_approval: {
      post_message: ["channelId"],
    },
    tools_retry_policies: undefined,
    timeoutMs: undefined,
    metadata: MICROSOFT_TEAMS_SERVER,
  },
  sound_studio: {
    id: 37,
    availability: "manual",
    allowMultipleInstances: false,
    isRestricted: ({ plan }) => plan.isByok,
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
    metadata: MICROSOFT_EXCEL_SERVER,
  },
  http_client: {
    id: 39,
    availability: "manual",
    allowMultipleInstances: false,
    isRestricted: ({ featureFlags }) => {
      return !featureFlags.includes("http_client_tool");
    },
    isPreview: true,
    tools_arguments_requiring_approval: undefined,
    tools_retry_policies: undefined,
    timeoutMs: undefined,
    metadata: HTTP_CLIENT_SERVER,
  },
  ashby: {
    id: 40,
    availability: "manual",
    allowMultipleInstances: true,
    isRestricted: undefined,
    isPreview: false,
    requiresBearerToken: true,
    tools_arguments_requiring_approval: undefined,
    tools_retry_policies: undefined,
    timeoutMs: undefined,
    metadata: ASHBY_SERVER,
  },
  salesloft: {
    id: 41,
    availability: "manual",
    isRestricted: undefined,
    isPreview: false,
    allowMultipleInstances: true,
    requiresBearerToken: true,
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
    isRestricted: undefined,
    isPreview: false,
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
    isRestricted: undefined,
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
    allowMultipleInstances: true,
    isRestricted: undefined,
    isPreview: false,
    requiresBearerToken: true,
    tools_arguments_requiring_approval: undefined,
    tools_retry_policies: undefined,
    timeoutMs: undefined,
    metadata: STATUSPAGE_SERVER,
  },
  luma: {
    id: 51,
    availability: "manual",
    allowMultipleInstances: false,
    isRestricted: undefined,
    isPreview: false,
    requiresBearerToken: true,
    tools_arguments_requiring_approval: undefined,
    tools_retry_policies: undefined,
    timeoutMs: undefined,
    metadata: LUMA_SERVER,
  },
  fathom: {
    id: 50,
    availability: "manual",
    allowMultipleInstances: true,
    isPreview: false,
    isRestricted: undefined,
    tools_arguments_requiring_approval: undefined,
    tools_retry_policies: undefined,
    timeoutMs: undefined,
    metadata: FATHOM_SERVER,
  },
  gong: {
    id: 52,
    availability: "manual",
    allowMultipleInstances: true,
    isRestricted: undefined,
    isPreview: false,
    tools_arguments_requiring_approval: undefined,
    tools_retry_policies: undefined,
    timeoutMs: undefined,
    metadata: GONG_SERVER,
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
    requiresBearerToken: true,
    tools_arguments_requiring_approval: undefined,
    tools_retry_policies: undefined,
    timeoutMs: undefined,
    metadata: VAL_TOWN_SERVER,
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
    allowMultipleInstances: true,
    isRestricted: undefined,
    isPreview: false,
    requiresBearerToken: true,
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
  [SKILL_AUTHORING_SERVER_NAME]: {
    id: 1034,
    availability: "auto_hidden_builder",
    allowMultipleInstances: false,
    isPreview: false,
    isRestricted: undefined,
    tools_arguments_requiring_approval: undefined,
    tools_retry_policies: undefined,
    timeoutMs: undefined,
    metadata: SKILL_AUTHORING_SERVER,
  },
  triggers_management: {
    id: 1020,
    availability: "auto_hidden_builder",
    allowMultipleInstances: false,
    isPreview: false,
    isRestricted: undefined,
    tools_arguments_requiring_approval: undefined,
    tools_retry_policies: undefined,
    timeoutMs: undefined,
    metadata: TRIGGERS_MANAGEMENT_SERVER,
  },
  pod_manager: {
    id: 1021,
    availability: "auto_hidden_builder",
    allowMultipleInstances: false,
    isPreview: false,
    isRestricted: undefined,
    tools_arguments_requiring_approval: {
      create_conversation: ["dustPod"],
      add_message_to_conversation: ["dustPod"],
    },
    tools_retry_policies: undefined,
    timeoutMs: undefined,
    metadata: POD_MANAGER_SERVER,
  },
  pod_tasks: {
    id: 1029,
    availability: "auto_hidden_builder",
    allowMultipleInstances: false,
    isPreview: false,
    isRestricted: undefined,
    tools_arguments_requiring_approval: undefined,
    tools_retry_policies: undefined,
    timeoutMs: undefined,
    metadata: POD_TASKS_SERVER,
  },
  agent_sidekick_context: {
    id: 1022,
    availability: "auto_hidden_builder",
    allowMultipleInstances: false,
    isPreview: false,
    isRestricted: undefined,
    tools_arguments_requiring_approval: undefined,
    tools_retry_policies: undefined,
    timeoutMs: undefined,
    metadata: AGENT_SIDEKICK_CONTEXT_SERVER,
  },
  agent_sidekick_agent_state: {
    id: 1023,
    availability: "auto_hidden_builder",
    allowMultipleInstances: false,
    isPreview: false,
    isRestricted: undefined,
    tools_arguments_requiring_approval: undefined,
    tools_retry_policies: undefined,
    timeoutMs: undefined,
    metadata: AGENT_SIDEKICK_AGENT_STATE_SERVER,
  },
  sandbox: {
    id: 1024,
    availability: "auto_hidden_builder",
    allowMultipleInstances: false,
    isPreview: true,
    isRestricted: ({ featureFlags }) => {
      return !isComputerFeatureEnabled(featureFlags);
    },
    metadata: SANDBOX_SERVER,
    tools_arguments_requiring_approval: undefined,
    tools_retry_policies: undefined,
    // Derived from the max command timeout plus a buffer so the in-container
    // timeout returns captured output before this MCP deadline aborts the call.
    timeoutMs: SANDBOX_MCP_REQUEST_TIMEOUT_MS,
  },
  sandbox_functions: {
    id: 1037,
    availability: "auto_hidden_builder",
    allowMultipleInstances: false,
    isPreview: true,
    isRestricted: ({ featureFlags }) => {
      return !featureFlags.includes("sandbox_functions");
    },
    tools_arguments_requiring_approval: undefined,
    tools_retry_policies: undefined,
    timeoutMs: undefined,
    metadata: SANDBOX_FUNCTIONS_SERVER,
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
  poke: {
    id: 1027,
    availability: "manual",
    allowMultipleInstances: false,
    isRestricted: ({ featureFlags }) => !featureFlags.includes("poke_mcp"),
    isPreview: true,
    tools_arguments_requiring_approval: undefined,
    tools_retry_policies: undefined,
    timeoutMs: undefined,
    metadata: POKE_SERVER,
  },
  ask_user_question: {
    id: 1028,
    availability: "auto_hidden_builder",
    allowMultipleInstances: false,
    isPreview: false,
    isRestricted: undefined,
    tools_arguments_requiring_approval: undefined,
    tools_retry_policies: undefined,
    timeoutMs: undefined,
    metadata: ASK_USER_QUESTION_SERVER,
  },
  wakeups: {
    id: 1031,
    availability: "auto",
    allowMultipleInstances: false,
    isPreview: false,
    isRestricted: undefined,
    runtimeToolStakeLevelCallback: ({
      toolName,
      plan,
      configuredStakeLevel,
    }) => {
      if (toolName !== "schedule_wakeup") {
        return configuredStakeLevel;
      }

      return plan && isCreditPricedPlanPrefix(plan.code) ? "low" : "high";
    },
    tools_arguments_requiring_approval: undefined,
    tools_retry_policies: undefined,
    timeoutMs: undefined,
    metadata: WAKEUPS_SERVER,
  },
  clari_copilot: {
    id: 1030,
    availability: "manual",
    allowMultipleInstances: true,
    isRestricted: undefined,
    isPreview: false,
    requiresBearerToken: true,
    tools_arguments_requiring_approval: undefined,
    tools_retry_policies: undefined,
    timeoutMs: undefined,
    metadata: CLARI_COPILOT_SERVER,
  },
  plan_mode: {
    id: 1032,
    availability: "auto_hidden_builder",
    allowMultipleInstances: false,
    isRestricted: ({ featureFlags }) => !featureFlags.includes("plan_mode"),
    isPreview: true,
    tools_arguments_requiring_approval: undefined,
    tools_retry_policies: undefined,
    timeoutMs: undefined,
    metadata: PLAN_MODE_SERVER,
  },
  files: {
    id: 1033,
    availability: "auto_hidden_builder",
    allowMultipleInstances: false,
    isRestricted: undefined,
    isPreview: false,
    tools_arguments_requiring_approval: undefined,
    tools_retry_policies: undefined,
    timeoutMs: undefined,
    metadata: FILES_SERVER,
  },
  workspace_analytics: {
    id: 1035,
    // Available to all workspaces unless the admin opts out, and hidden from the
    // builder tool-picker; the skill wires it by name. Data access is enforced
    // per-tool via auth.isManager().
    availability: "auto_hidden_builder",
    allowMultipleInstances: false,
    isRestricted: ({ isWorkspaceAnalyticsEnabled }) =>
      !isWorkspaceAnalyticsEnabled,
    isPreview: false,
    tools_arguments_requiring_approval: undefined,
    tools_retry_policies: undefined,
    timeoutMs: undefined,
    metadata: WORKSPACE_ANALYTICS_SERVER,
  },
  workspace_management: {
    id: 1048,
    availability: "auto_hidden_builder",
    allowMultipleInstances: false,
    isRestricted: undefined,
    isPreview: false,
    tools_arguments_requiring_approval: undefined,
    tools_retry_policies: undefined,
    timeoutMs: undefined,
    metadata: WORKSPACE_MANAGEMENT_SERVER,
  },
  exa_people_and_company: {
    id: 1036,
    availability: "auto",
    allowMultipleInstances: false,
    isPreview: false,
    isRestricted: ({ featureFlags }) =>
      !featureFlags.includes("exa_people_and_company"),
    tools_arguments_requiring_approval: undefined,
    tools_retry_policies: undefined,
    timeoutMs: undefined,
    metadata: EXA_SERVER,
  },
  user_analytics: {
    id: 1039,
    availability: "auto_hidden_builder",
    allowMultipleInstances: false,
    isRestricted: undefined,
    isPreview: false,
    tools_arguments_requiring_approval: undefined,
    tools_retry_policies: undefined,
    timeoutMs: undefined,
    metadata: USER_ANALYTICS_SERVER,
  },
  activation_recommendations: {
    id: 1040,
    availability: "auto_hidden_builder",
    allowMultipleInstances: false,
    isRestricted: undefined,
    isPreview: false,
    tools_arguments_requiring_approval: undefined,
    tools_retry_policies: undefined,
    timeoutMs: undefined,
    metadata: ACTIVATION_RECOMMENDATIONS_SERVER,
  },
  agent_templates: {
    id: 1041,
    availability: "auto_hidden_builder",
    allowMultipleInstances: false,
    isPreview: false,
    isRestricted: undefined,
    tools_arguments_requiring_approval: undefined,
    tools_retry_policies: undefined,
    timeoutMs: undefined,
    metadata: AGENT_TEMPLATES_SERVER,
  },
  servicenow: {
    id: 1042,
    availability: "manual",
    allowMultipleInstances: true,
    isRestricted: ({ featureFlags }) => {
      return !featureFlags.includes("servicenow_tool");
    },
    isPreview: true,
    tools_arguments_requiring_approval: undefined,
    tools_retry_policies: undefined,
    timeoutMs: undefined,
    metadata: SERVICENOW_SERVER,
  },
  shopify: {
    id: 1046,
    availability: "manual",
    allowMultipleInstances: true,
    isRestricted: ({ featureFlags }) => {
      return !featureFlags.includes("shopify_tool");
    },
    isPreview: true,
    tools_arguments_requiring_approval: undefined,
    tools_retry_policies: undefined,
    timeoutMs: undefined,
    metadata: SHOPIFY_SERVER,
  },
  user_memory: {
    id: 1043,
    availability: "auto_hidden_builder",
    allowMultipleInstances: false,
    isRestricted: ({ featureFlags }) => {
      return !featureFlags.includes("user_memory");
    },
    isPreview: true,
    tools_arguments_requiring_approval: undefined,
    tools_retry_policies: undefined,
    timeoutMs: undefined,
    metadata: USER_MEMORY_SERVER,
  },
  [AGENT_DELEGATION_SERVER_NAME]: {
    id: 1045,
    availability: "auto_hidden_builder",
    allowMultipleInstances: false,
    isRestricted: undefined,
    isPreview: false,
    tools_arguments_requiring_approval: undefined,
    tools_retry_policies: undefined,
    timeoutMs: undefined,
    metadata: AGENT_DELEGATION_SERVER,
  },
  // Using satisfies here instead of: type to avoid TypeScript widening the type and breaking the type inference for AutoInternalMCPServerNameType.
} satisfies {
  [K in InternalMCPServerNameType]: InternalMCPServerEntry<K>;
});

type IsRestrictedCallback = (params: {
  plan: PlanType;
  featureFlags: WhitelistableFeature[];
  isDeepDiveDisabled: boolean;
  isWorkspaceAnalyticsEnabled: boolean;
}) => boolean;

type RuntimeToolStakeLevelCallbackParams = {
  toolName: string;
  plan: PlanType | null;
  configuredStakeLevel: MCPToolStakeLevelType;
};

type RuntimeToolStakeLevelCallback = (
  params: RuntimeToolStakeLevelCallbackParams
) => MCPToolStakeLevelType;

type InternalMCPServerEntry<
  K extends InternalMCPServerNameType = InternalMCPServerNameType,
> = {
  id: number;
  availability: MCPServerAvailability;
  allowMultipleInstances: boolean;
  isRestricted: IsRestrictedCallback | undefined;
  isPreview: boolean;
  runtimeToolStakeLevelCallback?: RuntimeToolStakeLevelCallback;
  // Defines which argument values scope approval for "medium" stake tools.
  // The user must approve each specific combination before the tool can execute.
  tools_arguments_requiring_approval: Record<string, string[]> | undefined;
  tools_retry_policies: Record<string, MCPToolRetryPolicyType> | undefined;
  timeoutMs: number | undefined;
  requiresBearerToken?: boolean;
  sensitivityLabelProvider?: string;
  // When false, the server is hidden from direct execution contexts (e.g. sandbox CLI).
  // Defaults to true.
  metadata: ServerMetadata & {
    serverInfo: InternalMCPServerDefinitionType & { name: K };
  };
} & (
  | {
      // A restricted server is not necessarily in preview (can be restricted based on the plan for instance).
      isPreview: boolean;
      isRestricted: IsRestrictedCallback;
    }
  // Non restricted server cannot be in preview
  | { isPreview: false; isRestricted: undefined }
);

export type InternalMCPServerNameType =
  (typeof AVAILABLE_INTERNAL_MCP_SERVER_NAMES)[number];

type StaticInternalMCPToolNameType<N extends InternalMCPServerNameType> =
  (typeof INTERNAL_MCP_SERVERS)[N]["metadata"]["tools"][number]["name"];

type DynamicInternalMCPToolNameOverrides = {
  data_sources_file_system: "find_tags";
  extract_data: "find_tags";
  include_data: "find_tags";
  missing_action_catcher: string;
  run_agent: string;
  run_dust_app: string;
  search: "find_tags";
};

export type InternalMCPToolNameType<N extends InternalMCPServerNameType> =
  N extends keyof DynamicInternalMCPToolNameOverrides
    ? StaticInternalMCPToolNameType<N> | DynamicInternalMCPToolNameOverrides[N]
    : StaticInternalMCPToolNameType<N>;

type AutoServerKeys<T> = {
  [K in keyof T]: T[K] extends { availability: "auto" | "auto_hidden_builder" }
    ? K
    : never;
}[keyof T];

export type AutoInternalMCPServerNameType = AutoServerKeys<
  typeof INTERNAL_MCP_SERVERS
>;

export function validateToolInputs<
  S extends InternalMCPServerNameType,
  T extends InternalMCPToolNameType<S>,
>(
  serverName: S,
  toolName: T,
  inputs: Record<string, unknown>
): inputs is z.infer<
  z.ZodObject<
    Extract<
      (typeof INTERNAL_MCP_SERVERS)[S]["metadata"]["tools"][number],
      { name: T }
    >["schema"]
  >
> {
  const toolMetadata = INTERNAL_MCP_SERVERS[serverName].metadata.tools.find(
    (tool) => tool.name === toolName
  );
  // The type enforces that this exists, but we return false out of retro-compatibility over tool/server name changes.
  if (!toolMetadata) {
    return false;
  }

  return z.object(toolMetadata.schema).safeParse(inputs).success;
}

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
  return INTERNAL_MCP_SERVERS[r.value.name].allowMultipleInstances;
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
  const server: InternalMCPServerEntry | undefined = INTERNAL_MCP_SERVERS[name];
  if (!server) {
    return "ActionRobotIcon";
  }

  return server.metadata.serverInfo.icon;
}

export function getInternalMCPServerToolIcon(
  serverName: InternalMCPServerNameType,
  toolName: string
): InternalAllowedIconType | null {
  const labels = getInternalMCPServerToolDisplayLabels(serverName);
  return labels?.[toolName]?.icon ?? null;
}

export function getInternalMCPServerDisplayedAs(
  toolServerId: string
): "agent" | "server" | undefined {
  const name = getInternalMCPServerNameFromSId(toolServerId);
  if (!name) {
    return undefined;
  }
  const server: InternalMCPServerEntry | undefined = INTERNAL_MCP_SERVERS[name];
  if (!server) {
    return undefined;
  }
  return server.metadata.serverInfo.displayedAs;
}

export function getInternalMCPServerToolArgumentsRequiringApproval(
  name: InternalMCPServerNameType,
  toolName: string
): string[] | undefined {
  const server: InternalMCPServerEntry = INTERNAL_MCP_SERVERS[name];

  return server.tools_arguments_requiring_approval?.[toolName];
}

export function resolveInternalMCPServerToolStakeLevel(
  name: InternalMCPServerNameType,
  params: RuntimeToolStakeLevelCallbackParams
): MCPToolStakeLevelType {
  const server: InternalMCPServerEntry = INTERNAL_MCP_SERVERS[name];

  return (
    server.runtimeToolStakeLevelCallback?.(params) ??
    params.configuredStakeLevel
  );
}

export function getInternalMCPServerToolDisplayLabels(
  name: InternalMCPServerNameType
): Record<string, ToolDisplayLabels> | null {
  const server: InternalMCPServerEntry | undefined = INTERNAL_MCP_SERVERS[name];
  if (!server) {
    return null;
  }

  const displayLabelsByTool: Record<string, ToolDisplayLabels> = {};
  let hasDisplayLabels = false;

  for (const tool of server.metadata.tools) {
    if (tool.displayLabels) {
      displayLabelsByTool[tool.name] = tool.displayLabels;
      hasDisplayLabels = true;
    }
  }

  if (!hasDisplayLabels) {
    return null;
  }

  return displayLabelsByTool;
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

export function isInternalMCPToolName<N extends InternalMCPServerNameType>(
  serverName: N,
  toolName: string
): toolName is InternalMCPToolNameType<N> {
  return (
    INTERNAL_MCP_SERVERS[serverName]?.metadata?.tools?.some(
      (tool) => tool.name === toolName
    ) ?? false
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

export function getInternalMCPServerMetadata(name: InternalMCPServerNameType) {
  const { serverInfo, tools }: ServerMetadata =
    INTERNAL_MCP_SERVERS[name].metadata;

  return {
    serverInfo,
    tools: tools.map(({ schema, ...tool }) => ({
      ...tool,
      // For the input schema we store a zod schema on the tool metadata, it's what's easier to use in the code because
      // we can infer a type from it, but tool specifications expect a JSON schema.
      inputSchema: zodToJsonSchema(z.object(schema)) as JSONSchema,
    })),
  };
}

const SENSITIVITY_LABEL_PROVIDER_BY_SERVER: Partial<
  Record<InternalMCPServerNameType, "microsoft">
> = {
  outlook: "microsoft",
  microsoft_drive: "microsoft",
  microsoft_teams: "microsoft",
};

export function getSensitivityLabelProviderForServerId(
  sId: string
): "microsoft" | null {
  const r = getInternalMCPServerNameAndWorkspaceId(sId);
  if (r.isErr()) {
    return null;
  }
  return SENSITIVITY_LABEL_PROVIDER_BY_SERVER[r.value.name] ?? null;
}
