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

export const AVAILABLE_INTERNAL_MCP_SERVER_NAMES = [
  // Note:
  // Names should reflect the purpose of the server but not directly the tools it contains.
  // We'll prefix all tools with the server name to avoid conflicts.
  // It's okay to change the name of the server as we don't refer to it directly.
  "agent_router",
  "conversation_files",
  "data_sources_file_system",
  "extract_data",
  "file_generation",
  "file_manager",
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

export const INTERNAL_MCP_SERVERS: Record<
  InternalMCPServerNameType,
  {
    id: number;
    availability: MCPServerAvailability;
    isRestricted?: (params: {
      plan: PlanType;
      featureFlags: WhitelistableFeature[];
    }) => boolean;
    tools_stakes?: Record<string, MCPToolStakeLevelType>;
    timeoutMs?: number;
  }
> = {
  // Note:
  // ids should be stable, do not change them when moving internal servers to production as it would break existing agents.

  github: {
    id: 1,
    availability: "manual",
    tools_stakes: {
      create_issue: "low",
      add_issue_to_project: "low",
      get_pull_request: "never_ask",
      list_organization_projects: "never_ask",
      list_issues: "never_ask",
      get_issue: "never_ask",
    },
  },
  image_generation: {
    id: 2,
    availability: "auto",
  },
  file_generation: {
    id: 3,
    availability: "auto",
  },
  query_tables: {
    id: 4,
    availability: "auto",
  },
  "web_search_&_browse": {
    id: 5,
    availability: "auto",
  },
  think: {
    id: 6,
    availability: "auto",
    isRestricted: ({ featureFlags }) => {
      return !featureFlags.includes("dev_mcp_actions");
    },
  },
  hubspot: {
    id: 7,
    availability: "manual",
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
      create_ticket: "high",
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
  },
  agent_router: {
    id: 8,
    availability: "auto_hidden_builder",
  },
  include_data: {
    id: 9,
    availability: "auto",
  },
  run_dust_app: {
    id: 10,
    availability: "auto",
  },
  notion: {
    id: 11,
    availability: "manual",
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
  },
  extract_data: {
    id: 12,
    availability: "auto",
  },
  missing_action_catcher: {
    id: 13,
    availability: "auto_hidden_builder",
  },
  salesforce: {
    id: 14,
    availability: "manual",
    isRestricted: ({ featureFlags, plan }) => {
      const isInPlan = plan.limits.connections.isSalesforceAllowed;
      const hasFeatureFlag = featureFlags.includes("salesforce_tool");
      const isAvailable = isInPlan || hasFeatureFlag;
      return !isAvailable;
    },
    tools_stakes: {
      execute_read_query: "never_ask",
      list_objects: "never_ask",
      describe_object: "never_ask",
    },
  },
  gmail: {
    id: 15,
    availability: "manual",
    tools_stakes: {
      get_drafts: "never_ask",
      create_draft: "low",
      get_messages: "low",
      create_reply_draft: "low",
    },
  },
  google_calendar: {
    id: 16,
    availability: "manual",
    tools_stakes: {
      list_calendars: "never_ask",
      list_events: "never_ask",
      get_event: "never_ask",
      create_event: "low",
      update_event: "low",
      delete_event: "low",
      check_availability: "never_ask",
    },
  },
  conversation_files: {
    id: 17,
    availability: "auto_hidden_builder",
  },
  slack: {
    id: 18,
    availability: "manual",
    tools_stakes: {
      search_messages: "never_ask",
      list_users: "never_ask",
      list_public_channels: "never_ask",
      list_threads: "never_ask",
      post_message: "low",
    },
  },
  google_sheets: {
    id: 19,
    availability: "manual",
    isRestricted: ({ featureFlags }) => {
      return !featureFlags.includes("google_sheets_tool");
    },
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
  },
  monday: {
    id: 20,
    availability: "manual",
    isRestricted: ({ featureFlags }) => {
      return !featureFlags.includes("monday_tool");
    },
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
  },
  agent_memory: {
    id: 21,
    availability: "auto",
    isRestricted: ({ featureFlags }) => {
      return !featureFlags.includes("agent_memory_tools");
    },
  },
  file_manager: {
    id: 22,
    availability: "auto_hidden_builder",
    isRestricted: ({ featureFlags }) => {
      return !featureFlags.includes("file_manager_server");
    },
  },
  jira: {
    id: 22,
    availability: "manual",
    isRestricted: ({ featureFlags }) => {
      return !featureFlags.includes("jira_tool");
    },
    tools_stakes: {
      // Read operations - never ask (no side effects)
      get_issue: "never_ask",
    },
  },
  search: {
    id: 1006,
    availability: "auto",
  },
  run_agent: {
    id: 1008,
    availability: "auto",
    timeoutMs: 5 * 60 * 1000, // 5 minutes
  },
  primitive_types_debugger: {
    id: 1004,
    availability: "manual",
    isRestricted: ({ featureFlags }) => {
      return !featureFlags.includes("dev_mcp_actions");
    },
  },
  reasoning: {
    id: 1007,
    availability: "auto",
  },
  query_tables_v2: {
    id: 1009,
    availability: "auto",
    // We'll eventually switch everyone to this new tables query toolset.
    isRestricted: ({ featureFlags }) => {
      return !featureFlags.includes("exploded_tables_query");
    },
  },
  data_sources_file_system: {
    id: 1010,
    availability: "auto",
    // This server is hidden for everyone, it is only available through the search tool
    // when the advanced_search mode is enabled.
    isRestricted: () => true,
  },
};

export type InternalMCPServerNameType =
  (typeof AVAILABLE_INTERNAL_MCP_SERVER_NAMES)[number];

export const getAvailabilityOfInternalMCPServerByName = (
  name: InternalMCPServerNameType
): MCPServerAvailability => {
  return INTERNAL_MCP_SERVERS[name].availability;
};

export const getInternalMCPServerAvailability = (
  sId: string
): MCPServerAvailability => {
  const r = getInternalMCPServerNameAndWorkspaceId(sId);
  if (r.isErr()) {
    return "manual";
  }
  return getAvailabilityOfInternalMCPServerByName(r.value.name);
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
