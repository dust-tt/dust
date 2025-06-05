import type { MCPToolStakeLevelType } from "@app/lib/actions/constants";
import { getResourceNameAndIdFromSId } from "@app/lib/resources/string_ids";
import type { ModelId, Result, WhitelistableFeature } from "@app/types";
import { Err, Ok } from "@app/types";

export const AVAILABLE_INTERNAL_MCP_SERVER_NAMES = [
  // Note:
  // Names should reflect the purpose of the server, but not directly the tools it contains.
  // We'll prefix all tools with the server name to avoid conflicts.
  // It's okay to change the name of the server as we don't refer to it directly.
  "agent_router",
  "data_sources_file_system",
  "extract_data",
  "file_generation",
  "github",
  "gmail",
  "hubspot",
  "image_generation",
  "include_data",
  "missing_action_catcher",
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
] as const;

// Whether the server is available by default in the global space.
// Hidden servers are available by default in the global space but are not visible in the assistant builder.
const MCP_SERVER_AVAILABILITY = [
  "manual",
  "auto",
  "auto_hidden_builder",
] as const;
export type MCPServerAvailability = (typeof MCP_SERVER_AVAILABILITY)[number];

export const INTERNAL_MCP_SERVERS: Record<
  InternalMCPServerNameType,
  {
    id: number;
    availability: MCPServerAvailability;
    flag: WhitelistableFeature | null;
    tools_stakes?: Record<string, MCPToolStakeLevelType>;
  }
> = {
  // Notes:
  // ids should be stable, do not change them for production internal servers as it would break existing agents.
  // Let's start dev actions at 1000 to avoid conflicts with production actions.
  // flag "dev_mcp_actions" for actions that are only used internally for dev and testing.

  // Production
  github: {
    id: 1,
    availability: "manual",
    flag: null,
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
    flag: null,
  },
  file_generation: {
    id: 3,
    availability: "auto",
    flag: null,
  },
  query_tables: {
    id: 4,
    availability: "auto",
    flag: null,
  },
  "web_search_&_browse": {
    id: 5,
    availability: "auto",
    flag: null,
  },
  think: {
    id: 6,
    availability: "auto",
    flag: "dev_mcp_actions",
  },
  hubspot: {
    id: 7,
    availability: "manual",
    flag: null,
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

      // Other operations.
      count_objects_by_properties: "never_ask",
      search_crm_objects: "never_ask",
    },
  },
  agent_router: {
    id: 8,
    availability: "auto_hidden_builder",
    flag: "dev_mcp_actions",
  },
  include_data: {
    id: 9,
    availability: "auto",
    flag: null,
  },
  run_dust_app: {
    id: 10,
    availability: "auto",
    flag: "dev_mcp_actions",
  },
  notion: {
    id: 11,
    availability: "manual",
    flag: null,
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
    flag: "dev_mcp_actions",
  },
  missing_action_catcher: {
    id: 13,
    availability: "auto_hidden_builder",
    flag: null,
  },
  salesforce: {
    id: 14,
    availability: "manual",
    flag: "salesforce_tool",
    tools_stakes: {
      execute_read_query: "low",
      list_objects: "low",
      describe_object: "low",
    },
  },
  gmail: {
    id: 15,
    availability: "manual",
    flag: "gmail_tool",
    tools_stakes: {
      get_drafts: "never_ask",
      create_draft: "low",
    },
  },

  // Dev
  primitive_types_debugger: {
    id: 1004,
    availability: "manual",
    flag: "dev_mcp_actions",
  },
  search: {
    id: 1006,
    availability: "auto",
    flag: null,
  },
  reasoning: {
    id: 1007,
    availability: "auto",
    flag: null,
  },
  run_agent: {
    id: 1008,
    availability: "auto",
    flag: "dev_mcp_actions",
  },
  query_tables_v2: {
    id: 1009,
    availability: "auto",
    // We'll eventually switch everyone to this new tables query toolset.
    flag: "exploded_tables_query",
  },
  data_sources_file_system: {
    id: 1010,
    availability: "auto",
    flag: "dev_mcp_actions",
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
