import type { MCPToolStakeLevelType } from "@app/lib/actions/constants";
import {
  DEFAULT_AGENT_ROUTER_ACTION_DESCRIPTION,
  DEFAULT_AGENT_ROUTER_ACTION_NAME,
} from "@app/lib/actions/constants";
import {
  DEFAULT_WEBSEARCH_ACTION_DESCRIPTION,
  DEFAULT_WEBSEARCH_ACTION_NAME,
} from "@app/lib/actions/constants";
import {
  FRESHSERVICE_SERVER_INSTRUCTIONS,
  JIRA_SERVER_INSTRUCTIONS,
  SALESFORCE_SERVER_INSTRUCTIONS,
} from "@app/lib/actions/mcp_internal_actions/instructions";
import type { InternalMCPServerDefinitionType } from "@app/lib/api/mcp";
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
export const TABLE_QUERY_SERVER_NAME = "query_tables";
export const TABLE_QUERY_V2_SERVER_NAME = "query_tables_v2";

export const AVAILABLE_INTERNAL_MCP_SERVER_NAMES = [
  // Note:
  // Names should reflect the purpose of the server but not directly the tools it contains.
  // We'll prefix all tools with the server name to avoid conflicts.
  // It's okay to change the name of the server as we don't refer to it directly.
  "agent_management",
  "agent_memory",
  "agent_router",
  "conversation_files",
  "data_sources_file_system",
  "data_warehouses",
  "extract_data",
  "file_generation",
  "freshservice",
  "github",
  "gmail",
  "google_calendar",
  "google_sheets",
  "hubspot",
  "image_generation",
  "include_data",
  "interactive_content",
  "jira",
  "missing_action_catcher",
  "monday",
  "notion",
  "outlook_calendar",
  "outlook",
  "primitive_types_debugger",
  "reasoning",
  "run_agent",
  "run_dust_app",
  "salesforce",
  "slack",
  "think",
  "toolsets",
  "web_search_&_browse",
  SEARCH_SERVER_NAME,
  TABLE_QUERY_SERVER_NAME,
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
      add_issue_to_project: "low",
      get_pull_request: "never_ask",
      list_organization_projects: "never_ask",
      list_issues: "never_ask",
      get_issue: "never_ask",
    },
    timeoutMs: undefined,
    serverInfo: {
      name: "github",
      version: "1.0.0",
      description: "GitHub tools to manage issues and pull requests.",
      authorization: {
        provider: "github" as const,
        supported_use_cases: ["platform_actions"] as const,
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
    timeoutMs: undefined,
    serverInfo: {
      name: "image_generation",
      version: "1.0.0",
      description: "Agent can generate images (GPT Image 1).",
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
    timeoutMs: undefined,
    serverInfo: {
      name: "file_generation",
      version: "1.0.0",
      description: "Agent can generate and convert files.",
      authorization: null,
      icon: "ActionDocumentTextIcon",
      documentationUrl: null,
      instructions: null,
    },
  },
  [TABLE_QUERY_SERVER_NAME]: {
    id: 4,
    availability: "auto",
    allowMultipleInstances: false,
    isRestricted: undefined,
    isPreview: false,
    tools_stakes: undefined,
    timeoutMs: undefined,
    serverInfo: {
      name: TABLE_QUERY_SERVER_NAME,
      version: "1.0.0",
      description: "Tables, Spreadsheets, Notion DBs (quantitative).",
      icon: "ActionTableIcon",
      authorization: null,
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
  think: {
    id: 6,
    availability: "auto",
    allowMultipleInstances: false,
    isRestricted: ({ featureFlags }) => {
      return !featureFlags.includes("dev_mcp_actions");
    },
    isPreview: true,
    tools_stakes: undefined,
    timeoutMs: undefined,
    serverInfo: {
      name: "think",
      version: "1.0.0",
      description: "Expand thinking and reasoning capabilities.",
      icon: "ActionBrainIcon",
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
    timeoutMs: undefined,
    serverInfo: {
      name: "hubspot",
      version: "1.0.0",
      description:
        "Comprehensive HubSpot CRM integration supporting all object types (contacts, companies, deals) and ALL engagement types (tasks, notes, meetings, calls, emails). " +
        "Features advanced user activity tracking, owner search and listing, association management, and enhanced search capabilities with owner filtering. " +
        "Perfect for CRM data management and user activity analysis.",
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
    timeoutMs: undefined,
    serverInfo: {
      name: "include_data",
      version: "1.0.0",
      description: "Include data exhaustively",
      icon: "ActionTimeIcon",
      authorization: null,
      documentationUrl: null,
      instructions: null,
    },
  },
  run_dust_app: {
    id: 10,
    availability: "auto",
    allowMultipleInstances: false,
    isRestricted: undefined,
    isPreview: false,
    tools_stakes: undefined,
    timeoutMs: undefined,
    serverInfo: {
      name: "run_dust_app",
      version: "1.0.0",
      description: "Run Dust Apps with specified parameters",
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
    timeoutMs: undefined,
    serverInfo: {
      name: "notion",
      version: "1.0.0",
      description: "Notion tools to manage pages and databases.",
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
    timeoutMs: undefined,
    serverInfo: {
      name: "extract_data",
      version: "1.0.0",
      description: "Structured extraction",
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
    },
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
    timeoutMs: undefined,
    serverInfo: {
      name: "gmail",
      version: "1.0.0",
      description: "Gmail tools for reading emails and managing email drafts.",
      authorization: {
        provider: "google_drive" as const,
        supported_use_cases: ["personal_actions"] as const,
        scope:
          "https://www.googleapis.com/auth/gmail.readonly https://www.googleapis.com/auth/gmail.compose" as const,
      },
      icon: "GmailLogo",
      documentationUrl: "https://docs.dust.tt/docs/gmail-tool-setup",
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
    },
    timeoutMs: undefined,
    serverInfo: {
      name: "google_calendar",
      version: "1.0.0",
      description: "Tools for managing Google calendars and events.",
      authorization: {
        provider: "google_drive",
        supported_use_cases: ["personal_actions"] as const,
        scope:
          "https://www.googleapis.com/auth/calendar https://www.googleapis.com/auth/calendar.events" as const,
      },
      icon: "GcalLogo",
      documentationUrl: "https://docs.dust.tt/docs/google-calendar",
      instructions: null,
    },
  },
  conversation_files: {
    id: 17,
    availability: "auto_hidden_builder",
    allowMultipleInstances: false,
    isRestricted: undefined,
    isPreview: false,
    tools_stakes: undefined,
    timeoutMs: undefined,
    serverInfo: {
      name: "conversation_files",
      version: "1.0.0",
      description: "Include files from conversation attachments",
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
    },
    timeoutMs: undefined,
    serverInfo: {
      name: "google_sheets",
      version: "1.0.0",
      description: "Tools for managing Google Sheets spreadsheets and data.",
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
    timeoutMs: undefined,
    serverInfo: {
      name: "monday",
      version: "1.0.0",
      description:
        "Monday.com integration providing CRM-like operations for boards, items, and updates. Enables reading and managing Monday.com boards and items through the GraphQL API.",
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
  agent_memory: {
    id: 21,
    availability: "auto",
    allowMultipleInstances: false,
    isRestricted: undefined,
    isPreview: false,
    tools_stakes: undefined,
    timeoutMs: undefined,
    serverInfo: {
      name: "agent_memory",
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
    isRestricted: ({ featureFlags }) => {
      return !featureFlags.includes("jira_tool");
    },
    isPreview: true,
    tools_stakes: {
      // Read operations - never ask (no side effects)
      get_issue: "never_ask",
      get_projects: "never_ask",
      get_project: "never_ask",
      get_transitions: "never_ask",
      get_issues: "never_ask",
      get_issue_types: "never_ask",
      get_issue_create_fields: "never_ask",
      get_issue_read_fields: "never_ask",
      get_connection_info: "never_ask",
      get_issue_link_types: "never_ask",
      get_users: "never_ask",

      // Update operations - low stakes
      create_comment: "low",
      transition_issue: "low",
      create_issue: "low",
      update_issue: "low",
      create_issue_link: "low",
      delete_issue_link: "low",
    },
    timeoutMs: undefined,
    serverInfo: {
      name: "jira",
      version: "1.0.0",
      description:
        "Comprehensive JIRA integration providing full issue management capabilities including create, read, update, comment, workflow transitions, and issue linking operations using the JIRA REST API.",
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
    isRestricted: ({ featureFlags }) => {
      return !featureFlags.includes("interactive_content_server");
    },
    isPreview: true,
    tools_stakes: undefined,
    timeoutMs: undefined,
    serverInfo: {
      name: "interactive_content",
      version: "1.0.0",
      description:
        "Create and update interactive content files that users can execute and interact with. Currently supports client-executable code.",
      authorization: null,
      icon: "ActionDocumentTextIcon",
      documentationUrl: null,
      instructions: null,
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
    timeoutMs: undefined,
    serverInfo: {
      name: "outlook",
      version: "1.0.0",
      description:
        "Outlook tools for reading emails, managing email drafts, and managing contacts.",
      authorization: {
        provider: "microsoft_tools" as const,
        supported_use_cases: ["personal_actions"] as const,
        scope:
          "Mail.ReadWrite Mail.ReadWrite.Shared Contacts.ReadWrite Contacts.ReadWrite.Shared User.Read offline_access" as const,
      },
      icon: "OutlookLogo",
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
      list_calendars: "never_ask",
      list_events: "never_ask",
      get_event: "never_ask",
      create_event: "low",
      update_event: "low",
      delete_event: "low",
      check_availability: "never_ask",
    },
    timeoutMs: undefined,
    serverInfo: {
      name: "outlook_calendar",
      version: "1.0.0",
      description: "Tools for managing Outlook calendars and events.",
      authorization: {
        provider: "microsoft_tools" as const,
        supported_use_cases: ["personal_actions"] as const,
        scope:
          "Calendars.ReadWrite Calendars.ReadWrite.Shared User.Read offline_access" as const,
      },
      icon: "OutlookLogo",
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
      list_departments: "never_ask",
      list_products: "never_ask",
      list_oncall_schedules: "never_ask",
      list_service_items: "never_ask",
      list_solution_categories: "never_ask",
      list_solution_articles: "never_ask",
      list_requesters: "never_ask",
      get_requester: "never_ask",
      list_purchase_orders: "never_ask",
      list_sla_policies: "never_ask",

      // Write operations - low/high stakes
      create_ticket: "low",
      add_ticket_note: "low",
      add_ticket_reply: "low",
      create_solution_article: "high",
    },
    timeoutMs: undefined,
    serverInfo: {
      name: "freshservice",
      icon: "FreshserviceLogo",
      version: "1.0.0",
      description:
        "Freshservice integration supporting ticket management, service catalog, solutions, departments, " +
        "on-call schedules, and more. Provides comprehensive access to Freshservice resources with " +
        "OAuth authentication and secure API access.",
      authorization: {
        provider: "freshservice" as const,
        supported_use_cases: ["platform_actions", "personal_actions"] as const,
      },
      documentationUrl: null,
      instructions: FRESHSERVICE_SERVER_INSTRUCTIONS,
    },
  },
  [SEARCH_SERVER_NAME]: {
    id: 1006,
    availability: "auto",
    allowMultipleInstances: false,
    isRestricted: undefined,
    isPreview: false,
    tools_stakes: undefined,
    timeoutMs: undefined,
    serverInfo: {
      name: SEARCH_SERVER_NAME,
      version: "1.0.0",
      description: "Search through selected Data sources",
      icon: "ActionMagnifyingGlassIcon",
      authorization: null,
      documentationUrl: null,
      instructions: null,
    },
  },
  run_agent: {
    id: 1008,
    availability: "auto",
    allowMultipleInstances: false,
    isRestricted: undefined,
    isPreview: false,
    tools_stakes: undefined,
    timeoutMs: 10 * 60 * 1000, // 10 minutes
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
  reasoning: {
    id: 1007,
    availability: "auto",
    allowMultipleInstances: false,
    isRestricted: undefined,
    isPreview: false,
    tools_stakes: undefined,
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
  query_tables_v2: {
    id: 1009,
    availability: "auto",
    allowMultipleInstances: false,
    // We'll eventually switch everyone to this new tables query toolset.
    isRestricted: ({ featureFlags }) => {
      return !featureFlags.includes("exploded_tables_query");
    },
    isPreview: true,
    tools_stakes: undefined,
    timeoutMs: undefined,
    serverInfo: {
      name: "query_tables_v2",
      version: "1.0.0",
      description:
        "Tables, Spreadsheets, Notion DBs (quantitative) (mcp, exploded).",
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
    timeoutMs: undefined,
    serverInfo: {
      name: "data_sources_file_system",
      version: "1.0.0",
      description:
        "Comprehensive content navigation toolkit for browsing user data sources. Provides Unix-like " +
        "browsing (ls, find) and smart search tools to help agents efficiently explore and discover " +
        "content from manually uploaded files or data synced from SaaS products (Notion, Slack, Github" +
        ", etc.) organized in a filesystem-like hierarchy. Each item in this tree-like hierarchy is " +
        "called a node, nodes are referenced by a nodeId.",
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
    timeoutMs: undefined,
    serverInfo: {
      name: "agent_management",
      version: "1.0.0",
      description: "Tools for managing agent configurations",
      authorization: null,
      icon: "ActionRobotIcon",
      documentationUrl: null,
      instructions: null,
    },
  },
  data_warehouses: {
    id: 1012,
    availability: "auto",
    allowMultipleInstances: false,
    isPreview: true,
    isRestricted: ({ featureFlags }) => {
      return !featureFlags.includes("data_warehouses_tool");
    },
    tools_stakes: undefined,
    timeoutMs: undefined,
    serverInfo: {
      name: "data_warehouses",
      version: "1.0.0",
      description:
        "Comprehensive tables navigation toolkit for browsing data warehouses and tables. Provides Unix-like " +
        "browsing (ls, find) to help agents efficiently explore and discover tables organized in a " +
        "warehouse-centric hierarchy. Each warehouse contains schemas/databases which contain tables.",
      authorization: null,
      icon: "ActionTableIcon",
      documentationUrl: null,
      instructions: null,
    },
  },
  toolsets: {
    id: 1013,
    availability: "auto",
    allowMultipleInstances: false,
    isPreview: false,
    isRestricted: ({ featureFlags }) => {
      return !featureFlags.includes("toolsets_tool");
    },
    tools_stakes: undefined,
    timeoutMs: undefined,
    serverInfo: {
      name: "toolsets",
      version: "1.0.0",
      description:
        "Comprehensive navigation toolkit for browsing available toolsets. " +
        "Toolsets provide functions for the agent to use.",
      authorization: null,
      icon: "ActionLightbulbIcon",
      documentationUrl: null,
      instructions: null,
    },
  },
  // Using satisfies here instead of : type to avoid typescript widening the type and breaking the type inference for AutoInternalMCPServerNameType.
} satisfies {
  [K in InternalMCPServerNameType]: {
    id: number;
    availability: MCPServerAvailability;
    allowMultipleInstances: boolean;
    isRestricted:
      | ((params: {
          plan: PlanType;
          featureFlags: WhitelistableFeature[];
        }) => boolean)
      | undefined;
    isPreview: boolean;
    tools_stakes: Record<string, MCPToolStakeLevelType> | undefined;
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
