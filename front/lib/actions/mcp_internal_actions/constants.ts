import type { MCPToolStakeLevelType } from "@app/lib/actions/constants";
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
export const RUN_AGENT_TOOL_NAME = "run_agent";
export const CREATE_AGENT_TOOL_NAME = "create_agent";
export const FIND_TAGS_TOOL_NAME = "find_tags";
export const FILESYSTEM_CAT_TOOL_NAME = "cat";
export const FILESYSTEM_FIND_TOOL_NAME = "find";
export const FILESYSTEM_LOCATE_IN_TREE_TOOL_NAME = "locate_in_tree";
export const FILESYSTEM_LIST_TOOL_NAME = "list";

export const AVAILABLE_INTERNAL_MCP_SERVER_NAMES = [
  // Note:
  // Names should reflect the purpose of the server but not directly the tools it contains.
  // We'll prefix all tools with the server name to avoid conflicts.
  // It's okay to change the name of the server as we don't refer to it directly.
  "agent_management",
  "agent_router",
  "conversation_files",
  "data_sources_file_system",
  "extract_data",
  "file_generation",
  "freshservice",
  "interactive_content",
  "github",
  "gmail",
  "google_sheets",
  "hubspot",
  "image_generation",
  "include_data",
  "jira",
  "missing_action_catcher",
  "monday",
  "notion",
  "outlook",
  "primitive_types_debugger",
  "query_tables",
  "query_tables_v2",
  "reasoning",
  "run_agent",
  "run_dust_app",
  "salesforce",
  "search",
  "think",
  "web_search_&_browse",
  "google_calendar",
  "outlook_calendar",
  "slack",
  "agent_memory",
] as const;

// Whether the server is available by default in the global space.
// Hidden servers are available by default in the global space but are not visible in the assistant builder.
const MCP_SERVER_AVAILABILITY = [
  "manual",
  "auto",
  "auto_hidden_builder",
] as const;
export type MCPServerAvailability = (typeof MCP_SERVER_AVAILABILITY)[number];

export const isMCPServerAvailability = (
  availability: string
): availability is MCPServerAvailability => {
  return MCP_SERVER_AVAILABILITY.includes(
    availability as MCPServerAvailability
  );
};

export const INTERNAL_MCP_SERVERS = {
  // Note:
  // ids should be stable, do not change them when moving internal servers to production as it would break existing agents.

  github: {
    id: 1,
    availability: "manual",
    // Github only allows one instance of the same app per user.
    allowMultipleInstances: false,
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
  },
  image_generation: {
    id: 2,
    availability: "auto",
    allowMultipleInstances: false,
    isRestricted: undefined,
    isPreview: false,
    tools_stakes: undefined,
    timeoutMs: undefined,
  },
  file_generation: {
    id: 3,
    availability: "auto",
    allowMultipleInstances: false,
    isRestricted: undefined,
    isPreview: false,
    tools_stakes: undefined,
    timeoutMs: undefined,
  },
  query_tables: {
    id: 4,
    availability: "auto",
    allowMultipleInstances: false,
    isRestricted: undefined,
    isPreview: false,
    tools_stakes: undefined,
    timeoutMs: undefined,
  },
  "web_search_&_browse": {
    id: 5,
    availability: "auto",
    allowMultipleInstances: false,
    isRestricted: undefined,
    isPreview: false,
    tools_stakes: undefined,
    timeoutMs: undefined,
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
  },
  hubspot: {
    id: 7,
    availability: "manual",
    allowMultipleInstances: false,
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
  },
  agent_router: {
    id: 8,
    availability: "auto_hidden_builder",
    allowMultipleInstances: false,
    isRestricted: undefined,
    isPreview: false,
    tools_stakes: undefined,
    timeoutMs: undefined,
  },
  include_data: {
    id: 9,
    availability: "auto",
    allowMultipleInstances: false,
    isRestricted: undefined,
    isPreview: false,
    tools_stakes: undefined,
    timeoutMs: undefined,
  },
  run_dust_app: {
    id: 10,
    availability: "auto",
    allowMultipleInstances: false,
    isRestricted: undefined,
    isPreview: false,
    tools_stakes: undefined,
    timeoutMs: undefined,
  },
  notion: {
    id: 11,
    availability: "manual",
    allowMultipleInstances: false,
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
  },
  extract_data: {
    id: 12,
    availability: "auto",
    allowMultipleInstances: false,
    isRestricted: undefined,
    isPreview: false,
    tools_stakes: undefined,
    timeoutMs: undefined,
  },
  missing_action_catcher: {
    id: 13,
    availability: "auto_hidden_builder",
    allowMultipleInstances: false,
    isRestricted: undefined,
    isPreview: false,
    tools_stakes: undefined,
    timeoutMs: undefined,
  },
  salesforce: {
    id: 14,
    availability: "manual",
    allowMultipleInstances: false,
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
  },
  gmail: {
    id: 15,
    availability: "manual",
    allowMultipleInstances: false,
    isRestricted: undefined,
    isPreview: false,
    tools_stakes: {
      get_drafts: "never_ask",
      create_draft: "low",
      get_messages: "low",
      create_reply_draft: "low",
    },
    timeoutMs: undefined,
  },
  google_calendar: {
    id: 16,
    availability: "manual",
    allowMultipleInstances: false,
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
  },
  conversation_files: {
    id: 17,
    availability: "auto_hidden_builder",
    allowMultipleInstances: false,
    isRestricted: undefined,
    isPreview: false,
    tools_stakes: undefined,
    timeoutMs: undefined,
  },
  slack: {
    id: 18,
    availability: "manual",
    allowMultipleInstances: false,
    isRestricted: undefined,
    isPreview: false,
    tools_stakes: {
      search_messages: "never_ask",
      list_users: "never_ask",
      list_public_channels: "never_ask",
      list_threads: "never_ask",
      post_message: "low",
    },
    timeoutMs: undefined,
  },
  google_sheets: {
    id: 19,
    availability: "manual",
    allowMultipleInstances: false,
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
  },
  monday: {
    id: 20,
    availability: "manual",
    allowMultipleInstances: false,
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
  },
  agent_memory: {
    id: 21,
    availability: "auto",
    allowMultipleInstances: false,
    isRestricted: undefined,
    isPreview: false,
    tools_stakes: undefined,
    timeoutMs: undefined,
  },
  jira: {
    id: 22,
    availability: "manual",
    allowMultipleInstances: false,
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
      get_issue_fields: "never_ask",
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
  },
  outlook: {
    id: 24,
    availability: "manual",
    allowMultipleInstances: false,
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
  },
  outlook_calendar: {
    id: 25,
    availability: "manual",
    allowMultipleInstances: false,
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
  },
  freshservice: {
    id: 26,
    availability: "manual",
    allowMultipleInstances: false,
    isRestricted: ({ featureFlags }) => {
      return !featureFlags.includes("freshservice_tool");
    },
    isPreview: true,
    tools_stakes: {
      // Read operations - never ask
      list_tickets: "never_ask",
      get_ticket: "never_ask",
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
  },
  search: {
    id: 1006,
    availability: "auto",
    allowMultipleInstances: false,
    isRestricted: undefined,
    isPreview: false,
    tools_stakes: undefined,
    timeoutMs: undefined,
  },
  run_agent: {
    id: 1008,
    availability: "auto",
    allowMultipleInstances: false,
    isRestricted: undefined,
    isPreview: false,
    tools_stakes: undefined,
    timeoutMs: 10 * 60 * 1000, // 10 minutes
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
  },
  reasoning: {
    id: 1007,
    availability: "auto",
    allowMultipleInstances: false,
    isRestricted: undefined,
    isPreview: false,
    tools_stakes: undefined,
    timeoutMs: undefined,
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
  },
  // Using satisfies here instead of : type to avoid typescript widening the type and breaking the type inference for AutoInternalMCPServerNameType.
} satisfies Record<
  InternalMCPServerNameType,
  {
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
  }
>;

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
  return !!INTERNAL_MCP_SERVERS[name].allowMultipleInstances;
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
