import type { ServerMetadata } from "@app/lib/actions/mcp_internal_actions/tool_definition";
import { SearchAgentsQuerySchema } from "@app/lib/agent_search/query_schema";
import { SearchSkillsQuerySchema } from "@app/lib/skill_search/query_schema";
import { KNOWLEDGE_CATEGORIES } from "@app/types/api/public/spaces";
import { ModelProviderIdSchema } from "@app/types/assistant/models/providers";
import { MANAGEABLE_GROUP_KINDS } from "@app/types/groups";
import { JOB_TYPES } from "@app/types/job_type";
import { z } from "zod";

export const WORKSPACE_MANAGEMENT_SERVER_NAME = "workspace_management" as const;

export const SEARCH_AGENTS_TOOL_NAME = "search_agents" as const;
export const GET_AGENT_DETAILS_TOOL_NAME = "get_agent_details" as const;
export const SEARCH_SKILLS_TOOL_NAME = "search_skills" as const;
export const GET_SKILL_DETAILS_TOOL_NAME = "get_skill_details" as const;
export const LIST_TOOLS_TOOL_NAME = "list_tools" as const;
export const GET_TOOL_DETAILS_TOOL_NAME = "get_tool_details" as const;
export const LIST_MODELS_TOOL_NAME = "list_models" as const;
export const LIST_TAGS_TOOL_NAME = "list_tags" as const;
export const SEARCH_KNOWLEDGE_TOOL_NAME = "search_knowledge" as const;
export const LIST_WORKSPACE_MEMBERS_TOOL_NAME =
  "list_workspace_members" as const;
export const LIST_GROUPS_TOOL_NAME = "list_groups" as const;
export const GET_GROUP_MEMBERS_TOOL_NAME = "get_group_members" as const;
export const UPDATE_GROUP_MEMBERS_TOOL_NAME = "update_group_members" as const;
export const CREATE_GROUP_TOOL_NAME = "create_group" as const;

/**
 * @cc [owner:fabiencelier,label:security] member-identity-tools-manager-only
 * Tools that expose other members' identity (names, emails, group membership) MUST be listed here.
 * Their handlers MUST refuse callers who are not workspace admins or managers, and `createServer`
 * MUST NOT register them for such callers.
 */
export const MANAGER_ONLY_TOOL_NAMES = [
  LIST_WORKSPACE_MEMBERS_TOOL_NAME,
  LIST_GROUPS_TOOL_NAME,
  GET_GROUP_MEMBERS_TOOL_NAME,
  UPDATE_GROUP_MEMBERS_TOOL_NAME,
  CREATE_GROUP_TOOL_NAME,
] as const;

// Member rows are far cheaper than an agent configuration, so this tool pages much wider.
export const DEFAULT_MEMBERS_PAGE_SIZE = 100;
export const MAX_MEMBERS_PAGE_SIZE = 1000;

export const DEFAULT_PAGE_SIZE = 20;
export const MAX_PAGE_SIZE = 50;

const paginationSchemaShape = {
  cursor: z
    .number()
    .int()
    .nonnegative()
    .optional()
    .describe(
      "Pagination offset from a previous call's nextCursor. Omit for the first page."
    ),
  limit: z
    .number()
    .int()
    .positive()
    .max(MAX_PAGE_SIZE)
    .optional()
    .describe(
      `Rows per page. Default ${DEFAULT_PAGE_SIZE}, max ${MAX_PAGE_SIZE}.`
    ),
};

/**
 * @cc [owner:aubin-tchoi,label:product;mcp] name-query-required
 * Agent and skill search tools MUST require a non-empty name query after trimming whitespace.
 * Missing or blank queries MUST fail validation rather than return an exhaustive inventory.
 */
const searchQuerySchema = z
  .string()
  .trim()
  .min(1)
  .max(200)
  .describe(
    "Search by name. Words can appear anywhere in the name and in any order; " +
      "partial words are supported. Results are ordered by relevance."
  );

const searchAgentsSchema = SearchAgentsQuerySchema.omit({
  searchType: true,
  offset: true,
  facets: true,
  permissionFiltering: true,
  sortBy: true,
  sortOrder: true,
}).extend({ query: searchQuerySchema, ...paginationSchemaShape });

const searchSkillsSchema = SearchSkillsQuerySchema.omit({
  searchType: true,
  defaultToFavorites: true,
  excludeSkillId: true,
  offset: true,
  facets: true,
  permissionFiltering: true,
  sortBy: true,
  sortOrder: true,
}).extend({ query: searchQuerySchema, ...paginationSchemaShape });

const getAgentDetailsSchema = {
  agentId: z.string().describe("The agent's id, as returned by search_agents."),
};

const listWorkspaceMembersSchema = {
  userIds: z
    .array(z.string())
    .min(1)
    .max(MAX_MEMBERS_PAGE_SIZE)
    .optional()
    .describe(
      "Stable IDs of specific active workspace members to look up. Omit every " +
        "filter to list the whole workspace; at most one filter may be set."
    ),
  jobType: z
    .enum(JOB_TYPES)
    .optional()
    .describe("Only return active members with this job function."),
  groupId: z
    .string()
    .optional()
    .describe("Only return active members of this workspace group."),
  includeGroups: z
    .boolean()
    .default(false)
    .describe("Also return each member's workspace groups."),
  cursor: z
    .number()
    .int()
    .nonnegative()
    .optional()
    .describe(
      "Pagination offset from a previous call's nextCursor. Omit for the first page."
    ),
  limit: z
    .number()
    .int()
    .positive()
    .max(MAX_MEMBERS_PAGE_SIZE)
    .optional()
    .describe(
      `Members per page. Default ${DEFAULT_MEMBERS_PAGE_SIZE}, max ${MAX_MEMBERS_PAGE_SIZE}.`
    ),
};

const listGroupsSchema = {
  kind: z
    .enum(MANAGEABLE_GROUP_KINDS)
    .optional()
    .describe(
      "Only return groups of this kind. 'provisioned': membership synced from " +
        "the identity provider (SSO/SCIM). 'regular_manual': members picked " +
        "one by one in Dust. Omit for both."
    ),
  ...paginationSchemaShape,
};

const getGroupMembersSchema = {
  groupId: z.string().describe("The group's id, as returned by list_groups."),
  cursor: z
    .number()
    .int()
    .nonnegative()
    .optional()
    .describe(
      "Pagination offset from a previous call's nextCursor. Omit for the first page."
    ),
  limit: z
    .number()
    .int()
    .positive()
    .max(MAX_MEMBERS_PAGE_SIZE)
    .optional()
    .describe(
      `Members per page. Default ${DEFAULT_MEMBERS_PAGE_SIZE}, max ${MAX_MEMBERS_PAGE_SIZE}.`
    ),
};

const updateGroupMembersSchema = {
  groupId: z
    .string()
    .describe(
      "The group's id, as returned by list_groups. Must be a " +
        "regular_manual group; provisioned groups are managed by the identity " +
        "provider and cannot be edited."
    ),
  additions: z
    .array(z.string())
    .max(MAX_MEMBERS_PAGE_SIZE)
    .default([])
    .describe("User ids of workspace members to add to the group."),
  removals: z
    .array(z.string())
    .max(MAX_MEMBERS_PAGE_SIZE)
    .default([])
    .describe("User ids of members to remove from the group."),
};

const createGroupSchema = {
  name: z
    .string()
    .min(1)
    .describe("The group's name. Must be unique within the workspace."),
  memberIds: z
    .array(z.string())
    .min(1)
    .max(MAX_MEMBERS_PAGE_SIZE)
    .describe(
      "User ids of the workspace members to add to the group. A group " +
        "always has at least one member."
    ),
};

const getSkillSchema = {
  skillId: z.string().describe("The skill's id, as returned by search_skills."),
};

const listToolsSchema = {
  namePrefix: z
    .string()
    .optional()
    .describe(
      "Only return tools whose name starts with this prefix (case-insensitive)."
    ),
  ...paginationSchemaShape,
};

const listModelsSchema = {
  providerId: ModelProviderIdSchema.optional().describe(
    "Only return the models of this provider (e.g. 'anthropic', 'openai', 'google_ai_studio', 'mistral')."
  ),
};

const getToolDetailsSchema = {
  toolId: z.string().describe("The tool's id, as returned by list_tools."),
};

const searchKnowledgeSchema = {
  query: z
    .string()
    .optional()
    .describe(
      "Natural language query describing the knowledge needed. Omit to list all available sources."
    ),
  topK: z
    .number()
    .int()
    .positive()
    .max(10)
    .default(5)
    .describe(
      "Maximum number of document hits to retrieve per data source (default: 5, only applies when query is provided)."
    ),
  category: z
    .enum(KNOWLEDGE_CATEGORIES)
    .optional()
    .describe(
      "Optional category to filter results: 'managed' (connected platforms), 'folder', or 'website'."
    ),
};

export const WORKSPACE_MANAGEMENT_TOOLS_METADATA = [
  {
    name: SEARCH_AGENTS_TOOL_NAME,
    description:
      "Search agents by name and return matching ids and descriptions, ordered " +
      "by relevance. Matches partial words anywhere in the name and in any order. " +
      "Only returns agents accessible to the caller, including eligible built-in agents.",
    schema: searchAgentsSchema.shape,
    stake: "never_ask",
    eager: true,
    displayLabels: {
      running: "Searching agents",
      done: "Searched agents",
    },
    toolCostCategory: "basic",
    freeUsage: true,
  },
  {
    name: GET_AGENT_DETAILS_TOOL_NAME,
    description:
      "Return an agent's full configuration: name, description, scope, model, " +
      "equipped skills and capabilities, and its complete system prompt and " +
      "instructions. Use this to inspect what an agent actually does. Admins " +
      "get every agent of the workspace, but for the ones they cannot read " +
      "the instructions, skills, tools and knowledge are withheld.",
    schema: getAgentDetailsSchema,
    stake: "never_ask",
    eager: true,
    displayLabels: {
      running: "Retrieving agent details",
      done: "Retrieved agent details",
    },
    toolCostCategory: "basic",
    freeUsage: true,
  },
  {
    name: SEARCH_SKILLS_TOOL_NAME,
    description:
      "Search skills by name and return matching ids and descriptions, ordered " +
      "by relevance. Matches partial words anywhere in the name and in any order. " +
      "Only returns skills accessible to the caller, including eligible built-in skills.",
    schema: searchSkillsSchema.shape,
    stake: "never_ask",
    eager: true,
    displayLabels: {
      running: "Searching skills",
      done: "Searched skills",
    },
    toolCostCategory: "basic",
    freeUsage: true,
  },
  {
    name: GET_SKILL_DETAILS_TOOL_NAME,
    description:
      "Return a skill's full details: descriptions, availability, status, the " +
      "tools it equips, and its instructions. Dust's built-in skills keep their " +
      "instructions private, so those come back empty.",
    schema: getSkillSchema,
    stake: "never_ask",
    eager: true,
    displayLabels: {
      running: "Retrieving skill",
      done: "Retrieved skill",
    },
    toolCostCategory: "basic",
    freeUsage: true,
  },
  {
    name: LIST_TOOLS_TOOL_NAME,
    description:
      "List the tools (MCP servers) that can be equipped on agents and skills, " +
      "with their id, name and description. Knowledge tools (search, tables, " +
      "include data) are configured as knowledge instead and are not listed.",
    schema: listToolsSchema,
    stake: "never_ask",
    eager: true,
    displayLabels: {
      running: "Listing tools",
      done: "Listed tools",
    },
    toolCostCategory: "basic",
    freeUsage: true,
  },
  {
    name: GET_TOOL_DETAILS_TOOL_NAME,
    description:
      "Return a tool's (MCP server's) details: its description and, for each " +
      "function it exposes, the name, description and input parameters.",
    schema: getToolDetailsSchema,
    stake: "never_ask",
    eager: true,
    displayLabels: {
      running: "Retrieving tool details",
      done: "Retrieved tool details",
    },
    toolCostCategory: "basic",
    freeUsage: true,
  },
  {
    name: LIST_MODELS_TOOL_NAME,
    description:
      "List the models agents of this workspace can be set to, with their modelId, name, " +
      "description and the reasoning efforts they support.",
    schema: listModelsSchema,
    stake: "never_ask",
    eager: true,
    displayLabels: {
      running: "Listing models",
      done: "Listed models",
    },
    toolCostCategory: "basic",
    freeUsage: true,
  },
  {
    name: LIST_TAGS_TOOL_NAME,
    description:
      "List the workspace's agent tags with their name, id and kind. Protected tags can " +
      "only be added to or removed from agents by users who can publish agents.",
    schema: {},
    stake: "never_ask",
    eager: true,
    displayLabels: {
      running: "Listing tags",
      done: "Listed tags",
    },
    toolCostCategory: "basic",
    freeUsage: true,
  },
  {
    name: SEARCH_KNOWLEDGE_TOOL_NAME,
    description:
      "Browse or search the knowledge sources agents and skills can be given. " +
      "Without a query: list all available data source views. With a query: " +
      "semantically search them and return the matching data source views " +
      "with individual document nodes.",
    schema: searchKnowledgeSchema,
    stake: "never_ask",
    eager: true,
    displayLabels: {
      running: "Searching knowledge sources",
      done: "Searched knowledge sources",
    },
    toolCostCategory: "basic",
    freeUsage: true,
  },
  {
    name: LIST_WORKSPACE_MEMBERS_TOOL_NAME,
    description:
      "List active workspace members with their role and job function. " +
      "Admin and manager only.",
    schema: listWorkspaceMembersSchema,
    stake: "never_ask",
    eager: true,
    displayLabels: {
      running: "Listing workspace members",
      done: "Workspace members listed",
    },
    toolCostCategory: "basic",
    freeUsage: true,
  },
  {
    name: LIST_GROUPS_TOOL_NAME,
    description:
      "List the workspace's groups with their id, name, kind (provisioned " +
      "from the identity provider, or manually managed in Dust), member " +
      "count and the workspace role they grant, if any. Admin and manager only.",
    schema: listGroupsSchema,
    stake: "never_ask",
    eager: true,
    displayLabels: {
      running: "Listing groups",
      done: "Listed groups",
    },
    toolCostCategory: "basic",
    freeUsage: true,
  },
  {
    name: GET_GROUP_MEMBERS_TOOL_NAME,
    description:
      "List the active members of a group with their user id and name. " +
      "Admin and manager only.",
    schema: getGroupMembersSchema,
    stake: "never_ask",
    eager: true,
    displayLabels: {
      running: "Listing group members",
      done: "Listed group members",
    },
    toolCostCategory: "basic",
    freeUsage: true,
  },
  {
    name: UPDATE_GROUP_MEMBERS_TOOL_NAME,
    description:
      "Add and/or remove members of a manually managed group, leaving its " +
      "other members untouched. Provisioned groups cannot be edited. Admin " +
      "and manager only; groups that grant the admin role can only be edited " +
      "by admins.",
    schema: updateGroupMembersSchema,
    stake: "high",
    eager: true,
    displayLabels: {
      running: "Updating group members",
      done: "Updated group members",
    },
    toolCostCategory: "basic",
    freeUsage: true,
  },
  {
    name: CREATE_GROUP_TOOL_NAME,
    description:
      "Create a manually managed group with the given name and initial " +
      "members. Admin and manager only.",
    schema: createGroupSchema,
    stake: "high",
    eager: true,
    displayLabels: {
      running: "Creating group",
      done: "Created group",
    },
    toolCostCategory: "basic",
    freeUsage: true,
  },
] as const;

export const WORKSPACE_MANAGEMENT_SERVER = {
  serverInfo: {
    name: WORKSPACE_MANAGEMENT_SERVER_NAME,
    version: "1.0.0",
    description:
      "Search the workspace's agents and skills, and inventory tools, tags and groups.",
    icon: "ActionListCheckIcon",
    authorization: null,
    documentationUrl: null,
  },
  tools: WORKSPACE_MANAGEMENT_TOOLS_METADATA,
} as const satisfies ServerMetadata;
