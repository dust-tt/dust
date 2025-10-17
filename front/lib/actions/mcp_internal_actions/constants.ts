import type { InternalAllowedIconType } from "@app/components/resources/resources_icons";
import type { MCPToolStakeLevelType } from "@app/lib/actions/constants";
import {
  DEFAULT_AGENT_ROUTER_ACTION_DESCRIPTION,
  DEFAULT_AGENT_ROUTER_ACTION_NAME,
  DEFAULT_MCP_REQUEST_TIMEOUT_MS,
  DEFAULT_WEBSEARCH_ACTION_DESCRIPTION,
  DEFAULT_WEBSEARCH_ACTION_NAME,
} from "@app/lib/actions/constants";
import {
  FRESHSERVICE_SERVER_INSTRUCTIONS,
  JIRA_SERVER_INSTRUCTIONS,
  SALESFORCE_SERVER_INSTRUCTIONS,
} from "@app/lib/actions/mcp_internal_actions/instructions";
import { INTERACTIVE_CONTENT_INSTRUCTIONS } from "@app/lib/actions/mcp_internal_actions/servers/interactive_content/instructions";
import { SLIDESHOW_INSTRUCTIONS } from "@app/lib/actions/mcp_internal_actions/servers/slideshow/instructions";
import {
  DEEP_DIVE_NAME,
  DEEP_DIVE_SERVER_INSTRUCTIONS,
} from "@app/lib/api/assistant/global_agents/configurations/dust/consts";
import type {
  InternalMCPServerDefinitionType,
  MCPToolRetryPolicyType,
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

export const SEARCH_TOOL_NAME = "semantic_search";
export const INCLUDE_TOOL_NAME = "retrieve_recent_documents";
export const WEBSEARCH_TOOL_NAME = "websearch";
export const WEBBROWSER_TOOL_NAME = "webbrowser";
export const QUERY_TABLES_TOOL_NAME = "query_tables";
export const GET_DATABASE_SCHEMA_TOOL_NAME = "get_database_schema";
export const EXECUTE_DATABASE_QUERY_TOOL_NAME = "execute_database_query";
export const PROCESS_TOOL_NAME = "extract_information_from_documents";
export const CREATE_AGENT_TOOL_NAME = "create_agent";
export const FIND_TAGS_TOOL_NAME = "find_tags";
export const FILESYSTEM_CAT_TOOL_NAME = "cat";
export const FILESYSTEM_FIND_TOOL_NAME = "find";
export const FILESYSTEM_LOCATE_IN_TREE_TOOL_NAME = "locate_in_tree";
export const FILESYSTEM_LIST_TOOL_NAME = "list";
export const DATA_WAREHOUSES_LIST_TOOL_NAME = "list";
export const DATA_WAREHOUSES_FIND_TOOL_NAME = "find";
export const DATA_WAREHOUSES_DESCRIBE_TABLES_TOOL_NAME = "describe_tables";
export const DATA_WAREHOUSES_QUERY_TOOL_NAME = "query";

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
  "confluence",
  "conversation_files",
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
  "hubspot",
  "image_generation",
  "elevenlabs",
  "include_data",
  "interactive_content",
  "slideshow",
  "jira",
  "microsoft_drive",
  "microsoft_teams",
  "missing_action_catcher",
  "monday",
  "notion",
  "openai_usage",
  "outlook_calendar",
  "outlook",
  "primitive_types_debugger",
  "common_utilities",
  "jit_testing",
  "reasoning",
  "run_agent",
  "run_dust_app",
  "salesforce",
  "slack",
  "slack_bot",
  "toolsets",
  "web_search_&_browse",
  SEARCH_SERVER_NAME,
  TABLE_QUERY_V2_SERVER_NAME,
] as const;

// Whether the server is available by default in the global space.
// Hidden servers are available by default in the global space but are not visible in the assistant builder.
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
    tools_stakes: {
      create_issue: "low",
      comment_on_issue: "low",
      add_issue_to_project: "low",
      get_pull_request: "never_ask",
      list_organization_projects: "never_ask",
      list_issues: "never_ask",
      list_pull_requests: "never_ask",
      get_issue: "never_ask",
    },
    tools_retry_policies: undefined,
    timeoutMs: undefined,
    serverInfo: {
      name: "github",
      version: "1.0.0",
      description: "Manage issues and pull requests.",
      authorization: {
        provider: "github" as const,
        supported_use_cases: ["platform_actions", "personal_actions"] as const,
      },
      icon: "GithubLogo",
      documentationUrl: null,
      instructions: null,
    },
  },
  image_generation: {
    id: 2,
    availability: "auto",
    allowMultipleInstances: false,
    isRestricted: undefined,
    isPreview: false,
    tools_stakes: undefined,
    tools_retry_policies: undefined,
    timeoutMs: undefined,
    serverInfo: {
      name: "image_generation",
      version: "1.0.0",
      description: "Create visual content from text descriptions.",
      icon: "ActionImageIcon",
      authorization: null,
      documentationUrl: null,
      instructions: null,
    },
  },
  file_generation: {
    id: 3,
    availability: "auto",
    allowMultipleInstances: false,
    isRestricted: undefined,
    isPreview: false,
    tools_stakes: undefined,
    tools_retry_policies: undefined,
    timeoutMs: undefined,
    serverInfo: {
      name: "file_generation",
      version: "1.0.0",
      description: "Generate and convert documents.",
      authorization: null,
      icon: "ActionDocumentTextIcon",
      documentationUrl: null,
      instructions: null,
    },
  },
  [DEFAULT_WEBSEARCH_ACTION_NAME]: {
    id: 5,
    availability: "auto",
    allowMultipleInstances: false,
    isRestricted: undefined,
    isPreview: false,
    tools_stakes: undefined,
    tools_retry_policies: { default: "retry_on_interrupt" },
    timeoutMs: undefined,
    serverInfo: {
      name: DEFAULT_WEBSEARCH_ACTION_NAME,
      version: "1.0.0",
      description: DEFAULT_WEBSEARCH_ACTION_DESCRIPTION,
      icon: "ActionGlobeAltIcon",
      authorization: null,
      documentationUrl: null,
      instructions: null,
    },
  },
  hubspot: {
    id: 7,
    availability: "manual",
    allowMultipleInstances: true,
    isRestricted: undefined,
    isPreview: false,
    tools_stakes: {
      // Get operations.
      get_object_properties: "never_ask",
      get_object_by_email: "never_ask",
      get_latest_objects: "never_ask",
      get_contact: "never_ask",
      get_company: "never_ask",
      get_deal: "never_ask",
      get_meeting: "never_ask",
      get_file_public_url: "never_ask",
      get_associated_meetings: "never_ask",
      get_hubspot_link: "never_ask",
      get_hubspot_portal_id: "never_ask",
      list_owners: "never_ask",
      search_owners: "never_ask",
      get_current_user_id: "never_ask",
      get_user_activity: "never_ask",
      list_associations: "never_ask",

      count_objects_by_properties: "never_ask",
      search_crm_objects: "never_ask",
      export_crm_objects_csv: "never_ask",

      // Create operations.
      create_contact: "high",
      create_company: "high",
      create_deal: "high",
      create_lead: "high",
      create_task: "high",
      create_note: "high",
      create_communication: "high",
      create_meeting: "high",
      create_association: "high",

      // Update operations.
      update_contact: "high",
      update_company: "high",
      update_deal: "high",
      remove_association: "high",
    },
    tools_retry_policies: undefined,
    timeoutMs: undefined,
    serverInfo: {
      name: "hubspot",
      version: "1.0.0",
      description: "Access CRM contacts, deals and customer activities.",
      authorization: {
        provider: "hubspot" as const,
        supported_use_cases: ["platform_actions", "personal_actions"] as const,
      },
      icon: "HubspotLogo",
      documentationUrl: null,
      instructions: null,
    },
  },
  [DEFAULT_AGENT_ROUTER_ACTION_NAME]: {
    id: 8,
    availability: "auto_hidden_builder",
    allowMultipleInstances: false,
    isRestricted: undefined,
    isPreview: false,
    tools_stakes: undefined,
    tools_retry_policies: undefined,
    timeoutMs: undefined,
    serverInfo: {
      name: DEFAULT_AGENT_ROUTER_ACTION_NAME,
      version: "1.0.0",
      description: DEFAULT_AGENT_ROUTER_ACTION_DESCRIPTION,
      icon: "ActionRobotIcon",
      authorization: null,
      documentationUrl: null,
      instructions: `These tools provide discoverability to published agents available in the workspace.
The tools return agents with their "mention" markdown directive.
The directive should be used to display a clickable version of the agent name in the response.`,
    },
  },
  include_data: {
    id: 9,
    availability: "auto",
    allowMultipleInstances: false,
    isRestricted: undefined,
    isPreview: false,
    tools_stakes: undefined,
    tools_retry_policies: { default: "retry_on_interrupt" },
    timeoutMs: undefined,
    serverInfo: {
      name: "include_data",
      version: "1.0.0",
      description:
        "Load complete content for full context up to memory limits.",
      icon: "ActionTimeIcon",
      authorization: null,
      documentationUrl: null,
      instructions: null,
    },
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
    tools_retry_policies: undefined,
    timeoutMs: undefined,
    serverInfo: {
      name: "run_dust_app",
      version: "1.0.0",
      description: "Run Dust Apps with specified parameters.",
      icon: "CommandLineIcon",
      authorization: null,
      documentationUrl: null,
      instructions: null,
    },
  },
  notion: {
    id: 11,
    availability: "manual",
    allowMultipleInstances: true,
    isRestricted: undefined,
    isPreview: false,
    tools_stakes: {
      search: "never_ask",
      retrieve_page: "never_ask",
      retrieve_database_schema: "never_ask",
      retrieve_database_content: "never_ask",
      query_database: "never_ask",
      retrieve_block: "never_ask",
      retrieve_block_children: "never_ask",
      fetch_comments: "never_ask",
      list_users: "never_ask",
      get_about_user: "never_ask",

      create_page: "low",
      insert_row_into_database: "low",
      create_database: "low",
      update_page: "low",
      add_page_content: "low",
      create_comment: "low",
      delete_block: "low",
      update_row_database: "low",
      update_schema_database: "low",
    },
    tools_retry_policies: undefined,
    timeoutMs: undefined,
    serverInfo: {
      name: "notion",
      version: "1.0.0",
      description: "Access workspace pages and databases.",
      authorization: {
        provider: "notion" as const,
        supported_use_cases: ["platform_actions", "personal_actions"] as const,
      },
      icon: "NotionLogo",
      documentationUrl: null,
      instructions: null,
    },
  },
  extract_data: {
    id: 12,
    availability: "auto",
    allowMultipleInstances: false,
    isRestricted: undefined,
    isPreview: false,
    tools_stakes: undefined,
    tools_retry_policies: { default: "retry_on_interrupt" },
    timeoutMs: undefined,
    serverInfo: {
      name: "extract_data",
      version: "1.0.0",
      description: "Parse documents to create structured datasets.",
      icon: "ActionScanIcon",
      authorization: null,
      documentationUrl: null,
      instructions: null,
    },
  },
  missing_action_catcher: {
    id: 13,
    availability: "auto_hidden_builder",
    allowMultipleInstances: false,
    isRestricted: undefined,
    isPreview: false,
    tools_stakes: undefined,
    tools_retry_policies: undefined,
    timeoutMs: undefined,
    serverInfo: {
      name: "missing_action_catcher",
      version: "1.0.0",
      description: "To be used to catch errors and avoid erroring.",
      authorization: null,
      icon: "ActionDocumentTextIcon",
      documentationUrl: null,
      instructions: null,
    },
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
    tools_stakes: {
      execute_read_query: "never_ask",
      list_objects: "never_ask",
      describe_object: "never_ask",
      list_attachments: "never_ask",
      read_attachment: "never_ask",
      update_object: "high",
    },
    tools_retry_policies: undefined,
    timeoutMs: undefined,
    serverInfo: {
      name: "salesforce",
      version: "1.0.0",
      description: "Salesforce tools.",
      authorization: {
        provider: "salesforce" as const,
        supported_use_cases: ["personal_actions", "platform_actions"] as const,
      },
      icon: "SalesforceLogo",
      documentationUrl: "https://docs.dust.tt/docs/salesforce",
      instructions: SALESFORCE_SERVER_INSTRUCTIONS,
    },
  },
  gmail: {
    id: 15,
    availability: "manual",
    allowMultipleInstances: true,
    isRestricted: undefined,
    isPreview: false,
    tools_stakes: {
      get_drafts: "never_ask",
      create_draft: "low",
      get_messages: "low",
      create_reply_draft: "low",
    },
    tools_retry_policies: undefined,
    timeoutMs: undefined,
    serverInfo: {
      name: "gmail",
      version: "1.0.0",
      description: "Access messages and email drafts.",
      authorization: {
        provider: "google_drive" as const,
        supported_use_cases: ["personal_actions"] as const,
        scope:
          "https://www.googleapis.com/auth/gmail.readonly https://www.googleapis.com/auth/gmail.compose" as const,
      },
      icon: "GmailLogo",
      documentationUrl: "https://docs.dust.tt/docs/gmail",
      instructions: null,
    },
  },
  google_calendar: {
    id: 16,
    availability: "manual",
    allowMultipleInstances: true,
    isRestricted: undefined,
    isPreview: false,
    tools_stakes: {
      list_calendars: "never_ask",
      list_events: "never_ask",
      get_event: "never_ask",
      create_event: "low",
      update_event: "low",
      delete_event: "low",
      check_availability: "never_ask",
      get_user_timezones: "never_ask",
    },
    tools_retry_policies: undefined,
    timeoutMs: undefined,
    serverInfo: {
      name: "google_calendar",
      version: "1.0.0",
      description: "Access calendar schedules and appointments.",
      authorization: {
        provider: "google_drive",
        supported_use_cases: ["personal_actions"] as const,
        scope:
          "https://www.googleapis.com/auth/calendar https://www.googleapis.com/auth/calendar.events" as const,
      },
      icon: "GcalLogo",
      documentationUrl: "https://docs.dust.tt/docs/google-calendar",
      instructions:
        "By default when creating a meeting, (1) set the calling user as the organizer and an attendee (2) check availability for attendees using the check_availability tool (3) use get_user_timezones to check attendee timezones for better scheduling.",
    },
  },
  conversation_files: {
    id: 17,
    availability: "auto_hidden_builder",
    allowMultipleInstances: false,
    isRestricted: undefined,
    isPreview: false,
    tools_stakes: undefined,
    tools_retry_policies: undefined,
    timeoutMs: undefined,
    serverInfo: {
      name: "conversation_files",
      version: "1.0.0",
      description: "Include files from conversation attachments.",
      icon: "ActionDocumentTextIcon",
      authorization: null,
      documentationUrl: null,
      instructions: null,
    },
  },
  slack: {
    id: 18,
    availability: "manual",
    allowMultipleInstances: true,
    isRestricted: undefined,
    isPreview: false,
    tools_stakes: {
      search_messages: "never_ask",
      semantic_search_messages: "never_ask",
      list_users: "never_ask",
      list_public_channels: "never_ask",
      list_threads: "never_ask",
      post_message: "low",
      get_user: "never_ask",
    },
    tools_retry_policies: undefined,
    timeoutMs: undefined,
    serverInfo: {
      name: "slack",
      version: "1.0.0",
      description: "Slack tools for searching and posting messages.",
      authorization: {
        provider: "slack" as const,
        supported_use_cases: ["personal_actions"] as const,
      },
      icon: "SlackLogo",
      documentationUrl: "https://docs.dust.tt/docs/slack-mcp",
      instructions:
        "When posting a message on Slack, you MUST use Slack-flavored Markdown to format the message." +
        "IMPORTANT: if you want to mention a user, you must use <@USER_ID> where USER_ID is the id of the user you want to mention.\n" +
        "If you want to reference a channel, you must use #CHANNEL where CHANNEL is the channel name, or <#CHANNEL_ID> where CHANNEL_ID is the channel ID.",
    },
  },
  google_sheets: {
    id: 19,
    availability: "manual",
    allowMultipleInstances: true,
    isRestricted: ({ featureFlags }) => {
      return !featureFlags.includes("google_sheets_tool");
    },
    isPreview: true,
    tools_stakes: {
      list_spreadsheets: "never_ask",
      get_spreadsheet: "never_ask",
      get_worksheet: "never_ask",
      update_cells: "low",
      append_data: "low",
      clear_range: "low",
      create_spreadsheet: "low",
      add_worksheet: "low",
      delete_worksheet: "low",
      format_cells: "low",
      copy_sheet: "low",
      rename_worksheet: "low",
      move_worksheet: "low",
    },
    tools_retry_policies: undefined,
    timeoutMs: undefined,
    serverInfo: {
      name: "google_sheets",
      version: "1.0.0",
      description: "Work with spreadsheet data and tables.",
      authorization: {
        provider: "gmail",
        supported_use_cases: ["personal_actions"] as const,
        scope:
          "https://www.googleapis.com/auth/spreadsheets https://www.googleapis.com/auth/drive.readonly" as const,
      },
      icon: "GoogleSpreadsheetLogo",
      documentationUrl: "https://docs.dust.tt/docs/google-sheets",
      instructions: null,
    },
  },
  monday: {
    id: 20,
    availability: "manual",
    allowMultipleInstances: true,
    isRestricted: ({ featureFlags }) => {
      return !featureFlags.includes("monday_tool");
    },
    isPreview: true,
    tools_stakes: {
      // Read operations
      get_boards: "never_ask",
      get_board_items: "never_ask",
      get_item_details: "never_ask",
      search_items: "never_ask",
      get_items_by_column_value: "never_ask",
      find_user_by_name: "never_ask",
      get_board_values: "never_ask",
      get_column_values: "never_ask",
      get_file_column_values: "never_ask",
      get_group_details: "never_ask",
      get_subitem_values: "never_ask",
      get_user_details: "never_ask",

      // Write operations - High stakes
      create_item: "high",
      update_item: "high",
      update_item_name: "high",
      create_update: "high",
      create_board: "high",
      create_column: "high",
      create_group: "high",
      create_subitem: "high",
      update_subitem: "high",
      duplicate_group: "high",
      upload_file_to_column: "high",
      delete_item: "high",
      delete_group: "high",
    },
    tools_retry_policies: undefined,
    timeoutMs: undefined,
    serverInfo: {
      name: "monday",
      version: "1.0.0",
      description: "Manage project boards, items and updates.",
      authorization: {
        provider: "monday" as const,
        supported_use_cases: ["personal_actions", "platform_actions"] as const,
      },
      icon: "MondayLogo",
      documentationUrl:
        "https://developer.monday.com/api-reference/docs/introduction-to-graphql",
      instructions: null,
    },
  },
  [AGENT_MEMORY_SERVER_NAME]: {
    id: 21,
    availability: "auto",
    allowMultipleInstances: false,
    isRestricted: undefined,
    isPreview: false,
    tools_stakes: undefined,
    tools_retry_policies: undefined,
    timeoutMs: undefined,
    serverInfo: {
      name: AGENT_MEMORY_SERVER_NAME,
      version: "1.0.0",
      description: "User-scoped long-term memory tools for agents.",
      authorization: null,
      icon: "ActionLightbulbIcon",
      documentationUrl: null,
      instructions: null,
    },
  },
  jira: {
    id: 22,
    availability: "manual",
    allowMultipleInstances: true,
    isRestricted: undefined,
    isPreview: false,
    tools_stakes: {
      // Read operations - never ask (no side effects)
      get_issue: "never_ask",
      get_projects: "never_ask",
      get_project: "never_ask",
      get_project_versions: "never_ask",
      get_transitions: "never_ask",
      get_issues: "never_ask",
      get_issues_using_jql: "never_ask",
      get_issue_types: "never_ask",
      get_issue_create_fields: "never_ask",
      get_issue_read_fields: "never_ask",
      get_connection_info: "never_ask",
      get_issue_link_types: "never_ask",
      get_users: "never_ask",
      get_attachments: "never_ask",
      read_attachment: "never_ask",

      // Update operations - low stakes
      create_comment: "low",
      transition_issue: "low",
      create_issue: "low",
      update_issue: "low",
      create_issue_link: "low",
      delete_issue_link: "low",
      upload_attachment: "low",
    },
    tools_retry_policies: undefined,
    timeoutMs: undefined,
    serverInfo: {
      name: "jira",
      version: "1.0.0",
      description: "Create, update and track project issues.",
      authorization: {
        provider: "jira" as const,
        supported_use_cases: ["platform_actions", "personal_actions"] as const,
      },
      icon: "JiraLogo",
      documentationUrl: null,
      instructions: JIRA_SERVER_INSTRUCTIONS,
    },
  },
  interactive_content: {
    id: 23,
    availability: "auto",
    allowMultipleInstances: false,
    isRestricted: undefined,
    isPreview: false,
    tools_stakes: undefined,
    tools_retry_policies: undefined,
    timeoutMs: undefined,
    serverInfo: {
      name: "interactive_content",
      version: "1.0.0",
      description:
        "Create dashboards, presentations, or any interactive content.",
      authorization: null,
      icon: "ActionFrameIcon",
      documentationUrl: null,
      instructions: INTERACTIVE_CONTENT_INSTRUCTIONS,
    },
  },
  outlook: {
    id: 24,
    availability: "manual",
    allowMultipleInstances: true,
    isRestricted: undefined,
    isPreview: false,
    tools_stakes: {
      get_messages: "never_ask",
      get_drafts: "never_ask",
      create_draft: "low",
      delete_draft: "low",
      create_reply_draft: "low",
      get_contacts: "never_ask",
      create_contact: "high",
      update_contact: "high",
    },
    tools_retry_policies: undefined,
    timeoutMs: undefined,
    serverInfo: {
      name: "outlook",
      version: "1.0.0",
      description: "Read emails, manage drafts and contacts.",
      authorization: {
        provider: "microsoft_tools" as const,
        supported_use_cases: ["personal_actions"] as const,
        scope:
          "Mail.ReadWrite Mail.ReadWrite.Shared Contacts.ReadWrite Contacts.ReadWrite.Shared User.Read offline_access" as const,
      },
      icon: "MicrosoftOutlookLogo",
      documentationUrl: "https://docs.dust.tt/docs/outlook-tool-setup",
      instructions: null,
    },
  },
  outlook_calendar: {
    id: 25,
    availability: "manual",
    allowMultipleInstances: true,
    isRestricted: undefined,
    isPreview: false,
    tools_stakes: {
      get_user_timezone: "never_ask",
      list_calendars: "never_ask",
      list_events: "never_ask",
      get_event: "never_ask",
      create_event: "low",
      update_event: "low",
      delete_event: "low",
      check_availability: "never_ask",
    },
    tools_retry_policies: undefined,
    timeoutMs: undefined,
    serverInfo: {
      name: "outlook_calendar",
      version: "1.0.0",
      description: "Tools for managing Outlook calendars and events.",
      authorization: {
        provider: "microsoft_tools" as const,
        supported_use_cases: ["personal_actions"] as const,
        scope:
          "Calendars.ReadWrite Calendars.ReadWrite.Shared User.Read MailboxSettings.Read offline_access" as const,
      },
      icon: "MicrosoftOutlookLogo",
      documentationUrl: "https://docs.dust.tt/docs/outlook-calendar-tool-setup",
      instructions: null,
    },
  },
  freshservice: {
    id: 26,
    availability: "manual",
    allowMultipleInstances: true,
    isRestricted: ({ featureFlags }) => {
      return !featureFlags.includes("freshservice_tool");
    },
    isPreview: true,
    tools_stakes: {
      // Read operations - never ask
      list_tickets: "never_ask",
      get_ticket: "never_ask",
      get_ticket_read_fields: "never_ask",
      get_ticket_write_fields: "never_ask",
      list_departments: "never_ask",
      list_products: "never_ask",
      list_oncall_schedules: "never_ask",
      list_service_categories: "never_ask",
      list_service_items: "never_ask",
      search_service_items: "never_ask",
      get_service_item: "never_ask",
      get_service_item_fields: "never_ask",
      list_solution_categories: "never_ask",
      list_solution_folders: "never_ask",
      list_solution_articles: "never_ask",
      list_requesters: "never_ask",
      get_requester: "never_ask",
      list_purchase_orders: "never_ask",
      list_sla_policies: "never_ask",
      get_solution_article: "never_ask",
      list_canned_responses: "never_ask",
      get_canned_response: "never_ask",
      get_ticket_approval: "never_ask",
      list_ticket_approvals: "never_ask",
      list_ticket_tasks: "never_ask",
      get_ticket_task: "never_ask",

      // Write operations - low/high stakes
      create_ticket: "low",
      update_ticket: "low",
      add_ticket_note: "low",
      add_ticket_reply: "low",
      create_ticket_task: "low",
      update_ticket_task: "low",
      delete_ticket_task: "low",
      request_service_item: "low",
      request_service_approval: "low",
      create_solution_article: "high",
    },
    tools_retry_policies: undefined,
    timeoutMs: undefined,
    serverInfo: {
      name: "freshservice",
      icon: "FreshserviceLogo",
      version: "1.0.0",
      description: "Connect to tickets, schedules and service catalog.",
      authorization: {
        provider: "freshservice" as const,
        supported_use_cases: ["platform_actions", "personal_actions"] as const,
      },
      documentationUrl: null,
      instructions: FRESHSERVICE_SERVER_INSTRUCTIONS,
    },
  },
  google_drive: {
    id: 27,
    availability: "manual",
    allowMultipleInstances: true,
    isRestricted: undefined,
    isPreview: false,
    tools_stakes: {
      list_drives: "never_ask",
      search_files: "never_ask",
      get_file_content: "never_ask",
    },
    tools_retry_policies: { default: "retry_on_interrupt" },
    timeoutMs: undefined,
    serverInfo: {
      name: "google_drive",
      version: "1.0.0",
      description: "Search and read files (Docs, Sheets, Presentations).",
      authorization: {
        provider: "google_drive" as const,
        supported_use_cases: ["personal_actions"] as const,
        scope: "https://www.googleapis.com/auth/drive.readonly" as const,
      },
      icon: "DriveLogo",
      documentationUrl: "https://docs.dust.tt/docs/google-drive",
      instructions: null,
    },
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
    tools_retry_policies: undefined,
    timeoutMs: undefined,
    serverInfo: {
      name: "slideshow",
      version: "0.1.0",
      description: "Create interactive slideshows.",
      authorization: null,
      icon: "ActionDocumentTextIcon",
      documentationUrl: null,
      instructions: SLIDESHOW_INSTRUCTIONS,
    },
  },
  deep_dive: {
    id: 29,
    availability: "auto",
    isRestricted: ({ featureFlags, isDeepDiveDisabled }) => {
      return (
        !featureFlags.includes("deep_research_as_a_tool") || isDeepDiveDisabled
      );
    },
    allowMultipleInstances: false,
    isPreview: true,
    tools_stakes: undefined,
    tools_retry_policies: undefined,
    timeoutMs: undefined,
    serverInfo: {
      name: "deep_dive",
      version: "0.1.0",
      description: `Launch a handoff of the user's query to the @${DEEP_DIVE_NAME} agent.`,
      authorization: null,
      icon: "ActionAtomIcon",
      documentationUrl: null,
      instructions: DEEP_DIVE_SERVER_INSTRUCTIONS,
    },
  },
  slack_bot: {
    id: 31,
    availability: "manual" as const,
    allowMultipleInstances: true,
    isRestricted: ({ featureFlags }) => {
      return !featureFlags.includes("slack_bot_mcp");
    },
    isPreview: false,
    tools_stakes: {
      list_public_channels: "never_ask" as const,
      list_users: "never_ask" as const,
      get_user: "never_ask" as const,
      read_channel_history: "never_ask" as const,
      read_thread_messages: "never_ask" as const,

      post_message: "low" as const,
      add_reaction: "low" as const,
      remove_reaction: "low" as const,
    },
    tools_retry_policies: undefined,
    timeoutMs: undefined,
    serverInfo: {
      name: "slack_bot",
      version: "1.0.0",
      description: "Post messages and reactions as the workspace Dust bot.",
      authorization: {
        provider: "slack" as const,
        supported_use_cases: ["platform_actions"] as const,
      },
      icon: "SlackLogo",
      documentationUrl: null,
      instructions:
        "When posting a message on Slack, you MUST use Slack-flavored Markdown to format the message." +
        "IMPORTANT: if you want to mention a user, you must use <@USER_ID> where USER_ID is the id of the user you want to mention.\n" +
        "If you want to reference a channel, you must use #CHANNEL where CHANNEL is the channel name, or <#CHANNEL_ID> where CHANNEL_ID is the channel ID.",
    },
  },
  openai_usage: {
    id: 32,
    availability: "manual",
    allowMultipleInstances: false,
    isPreview: true,
    isRestricted: ({ featureFlags }) => {
      return !featureFlags.includes("openai_usage_mcp");
    },
    tools_stakes: {
      get_completions_usage: "low",
      get_organization_costs: "low",
    },
    tools_retry_policies: undefined,
    timeoutMs: undefined,
    serverInfo: {
      name: "openai_usage",
      version: "1.0.0",
      description: "Track API consumption and costs.",
      authorization: null,
      icon: "OpenaiLogo",
      documentationUrl: null,
      instructions: null,
      requiresSecret: true,
    },
  },
  confluence: {
    id: 33,
    availability: "manual",
    allowMultipleInstances: true,
    isRestricted: ({ featureFlags }) => {
      return !featureFlags.includes("confluence_tool");
    },
    isPreview: false,
    tools_stakes: {
      // Read operations - never ask
      get_current_user: "never_ask",
      get_pages: "never_ask",

      // Write operations - ask
      create_page: "low",
      update_page: "low",
    },
    tools_retry_policies: undefined,
    timeoutMs: undefined,
    serverInfo: {
      name: "confluence",
      version: "1.0.0",
      description: "Retrieve page information.",
      authorization: {
        provider: "confluence_tools" as const,
        supported_use_cases: ["platform_actions", "personal_actions"] as const,
      },
      icon: "ConfluenceLogo",
      documentationUrl: "https://docs.dust.tt/docs/confluence-tool",
      instructions: null,
    },
  },
  elevenlabs: {
    id: 34,
    availability: "manual",
    allowMultipleInstances: false,
    isRestricted: ({ featureFlags }) => {
      return !featureFlags.includes("elevenlabs_tool");
    },
    isPreview: false,
    tools_stakes: {
      text_to_speech: "low",
      generate_music: "low",
    },
    tools_retry_policies: { default: "retry_on_interrupt" },
    timeoutMs: undefined,
    serverInfo: {
      name: "elevenlabs",
      version: "1.0.0",
      description: "Generate speech audio and music with ElevenLabs.",
      authorization: null,
      icon: "ActionMegaphoneIcon",
      documentationUrl: null,
      instructions: null,
    },
  },
  microsoft_drive: {
    id: 35,
    availability: "manual",
    allowMultipleInstances: true,
    isRestricted: ({ featureFlags }) => {
      return !featureFlags.includes("microsoft_drive_mcp_server");
    },
    isPreview: false,
    tools_stakes: {
      search_in_files: "never_ask",
      search_drive_items: "never_ask",
      get_file_content: "never_ask",
    },
    tools_retry_policies: undefined,
    timeoutMs: undefined,
    serverInfo: {
      name: "microsoft_drive",
      version: "1.0.0",
      description: "Tools for managing Microsoft files.",
      authorization: {
        provider: "microsoft_tools" as const,
        supported_use_cases: ["personal_actions"] as const,
        scope:
          "User.Read Files.Read.All Sites.Read.All ExternalItem.Read.All" as const,
      },
      icon: "MicrosoftLogo",
      documentationUrl: "https://docs.dust.tt/docs/microsoft-drive-tool-setup",
      instructions: null,
    },
  },
  microsoft_teams: {
    id: 36,
    availability: "manual",
    allowMultipleInstances: true,
    isRestricted: ({ featureFlags }) => {
      return !featureFlags.includes("microsoft_teams_mcp_server");
    },
    isPreview: false,
    tools_stakes: {
      search_messages: "never_ask",
    },
    tools_retry_policies: undefined,
    timeoutMs: undefined,
    serverInfo: {
      name: "microsoft_teams",
      version: "1.0.0",
      description: "Search messages in Microsoft Teams.",
      authorization: {
        provider: "microsoft_tools" as const,
        supported_use_cases: ["personal_actions"] as const,
        scope:
          "User.Read Chat.Read ChatMessage.Read ChannelMessage.Read.All" as const,
      },
      icon: "MicrosoftTeamsLogo",
      documentationUrl: "https://docs.dust.tt/docs/microsoft-teams-tool-setup",
      instructions: null,
    },
  },
  [SEARCH_SERVER_NAME]: {
    id: 1006,
    availability: "auto",
    allowMultipleInstances: false,
    isRestricted: undefined,
    isPreview: false,
    tools_stakes: undefined,
    tools_retry_policies: { default: "retry_on_interrupt" },
    timeoutMs: undefined,
    serverInfo: {
      name: SEARCH_SERVER_NAME,
      version: "1.0.0",
      description: "Search content to find the most relevant information.",
      icon: "ActionMagnifyingGlassIcon",
      authorization: null,
      documentationUrl: null,
      instructions: null,
    },
  },
  run_agent: {
    id: 1008,
    availability: "auto",
    allowMultipleInstances: true,
    isRestricted: undefined,
    isPreview: false,
    tools_stakes: undefined,
    tools_retry_policies: { default: "retry_on_interrupt" },
    timeoutMs: DEFAULT_MCP_REQUEST_TIMEOUT_MS,
    serverInfo: {
      name: "run_agent",
      version: "1.0.0",
      description: "Run a child agent (agent as tool).",
      icon: "ActionRobotIcon",
      authorization: null,
      documentationUrl: null,
      instructions: null,
    },
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
    tools_retry_policies: undefined,
    timeoutMs: undefined,
    serverInfo: {
      name: "primitive_types_debugger",
      version: "1.0.0",
      description:
        "Demo server showing a basic interaction with various configurable blocks.",
      icon: "ActionEmotionLaughIcon",
      authorization: null,
      documentationUrl: null,
      instructions: null,
    },
  },
  common_utilities: {
    id: 1017,
    availability: "auto_hidden_builder",
    allowMultipleInstances: false,
    isPreview: false,
    isRestricted: undefined,
    tools_stakes: undefined,
    tools_retry_policies: undefined,
    timeoutMs: undefined,
    serverInfo: {
      name: "common_utilities",
      version: "1.0.0",
      description:
        "Miscellaneous helper tools such as random numbers, time retrieval, and timers.",
      icon: "ActionAtomIcon",
      authorization: null,
      documentationUrl: null,
      instructions: null,
    },
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
    tools_retry_policies: undefined,
    timeoutMs: undefined,
    serverInfo: {
      name: "jit_testing",
      version: "1.0.0",
      description: "Demo server to test if can be added to JIT.",
      icon: "ActionEmotionLaughIcon",
      authorization: null,
      documentationUrl: null,
      instructions: null,
    },
  },
  reasoning: {
    id: 1007,
    availability: "auto_hidden_builder",
    allowMultipleInstances: false,
    isRestricted: undefined,
    isPreview: false,
    tools_stakes: undefined,
    tools_retry_policies: undefined,
    timeoutMs: undefined,
    serverInfo: {
      name: "reasoning",
      version: "1.0.0",
      description:
        "Agent can decide to trigger a reasoning model for complex tasks.",
      icon: "ActionLightbulbIcon",
      authorization: null,
      documentationUrl: null,
      instructions: null,
    },
  },
  [TABLE_QUERY_V2_SERVER_NAME]: {
    id: 1009,
    availability: "auto",
    allowMultipleInstances: false,
    isRestricted: undefined,
    isPreview: false,
    tools_stakes: undefined,
    tools_retry_policies: undefined,
    timeoutMs: undefined,
    serverInfo: {
      name: "query_tables_v2",
      version: "1.0.0",
      description:
        "Query structured data like a spreadsheet or database for data analyses.",
      icon: "ActionTableIcon",
      authorization: null,
      documentationUrl: null,
      instructions: null,
    },
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
    tools_retry_policies: undefined,
    timeoutMs: undefined,
    serverInfo: {
      name: "data_sources_file_system",
      version: "1.0.0",
      description: "Browse and search content with filesystem-like navigation.",
      authorization: null,
      icon: "ActionDocumentTextIcon",
      documentationUrl: null,
      instructions: null,
    },
  },
  agent_management: {
    id: 1011,
    availability: "auto",
    allowMultipleInstances: false,
    isPreview: false,
    isRestricted: ({ featureFlags }) => {
      return !featureFlags.includes("agent_management_tool");
    },
    tools_stakes: {
      create_agent: "high",
    },
    tools_retry_policies: undefined,
    timeoutMs: undefined,
    serverInfo: {
      name: "agent_management",
      version: "1.0.0",
      description: "Tools for managing agent configurations.",
      authorization: null,
      icon: "ActionRobotIcon",
      documentationUrl: null,
      instructions: null,
    },
  },
  [DATA_WAREHOUSE_SERVER_NAME]: {
    id: 1012,
    availability: "auto_hidden_builder",
    allowMultipleInstances: false,
    isPreview: false,
    isRestricted: undefined,
    tools_stakes: undefined,
    tools_retry_policies: undefined,
    timeoutMs: undefined,
    serverInfo: {
      name: DATA_WAREHOUSE_SERVER_NAME,
      version: "1.0.0",
      description: "Browse tables organized by warehouse and schema.",
      authorization: null,
      icon: "ActionTableIcon",
      documentationUrl: null,
      instructions: null,
    },
  },
  toolsets: {
    id: 1013,
    availability: "auto_hidden_builder",
    allowMultipleInstances: false,
    isPreview: false,
    isRestricted: undefined,
    tools_stakes: undefined,
    tools_retry_policies: undefined,
    timeoutMs: undefined,
    serverInfo: {
      name: "toolsets",
      version: "1.0.0",
      description: "Browse available toolsets and functions.",
      authorization: null,
      icon: "ActionLightbulbIcon",
      documentationUrl: null,
      instructions: null,
    },
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
    tools_retry_policies: Record<string, MCPToolRetryPolicyType> | undefined;
    timeoutMs: number | undefined;
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
