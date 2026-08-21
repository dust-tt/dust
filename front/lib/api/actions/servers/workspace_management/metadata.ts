import type { ServerMetadata } from "@app/lib/actions/mcp_internal_actions/tool_definition";
import { z } from "zod";

export const WORKSPACE_MANAGEMENT_SERVER_NAME = "workspace_management" as const;

export const LIST_AGENTS_TOOL_NAME = "list_agents" as const;
export const GET_AGENT_DETAILS_TOOL_NAME = "get_agent_details" as const;
export const LIST_SKILLS_TOOL_NAME = "list_skills" as const;
export const GET_SKILL_DETAILS_TOOL_NAME = "get_skill_details" as const;

export const DEFAULT_PAGE_SIZE = 20;
export const MAX_PAGE_SIZE = 50;

// Mirrors the `view` parameter of the public
// GET /api/v1/w/{wId}/assistant/agent_configurations endpoint so both surfaces share one
// vocabulary, plus `archived`. `all_unrestricted` is the admin-only view that lifts both the scope restriction
// (unpublished agents the caller does not edit) and the space one.
const SKILL_AVAILABILITY_VALUES = [
  "editors",
  "workspace_users",
  "users_and_agents",
] as const;

const SKILL_STATUS_VALUES = ["active", "archived", "suggested"] as const;

export const AGENT_VIEWS = [
  "list",
  "all",
  "published",
  "global",
  "archived",
  "all_unrestricted",
] as const;
export type AgentViewType = (typeof AGENT_VIEWS)[number];

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

const listAgentsSchema = {
  view: z
    .enum(AGENT_VIEWS)
    .default("all")
    .describe(
      "Which agents to list. 'all' (default): every non-private agent of the " +
        "workspace. 'list': the agents the caller can see (the non-private ones " +
        "plus the unpublished ones they edit); needs an interactive user. " +
        "'published': published agents only. 'global': Dust's " +
        "built-in agents only. 'archived': agents that were deleted, limited " +
        "to those the caller edits, or all of them for an admin. " +
        "'all_unrestricted': every active agent of the " +
        "workspace, including unpublished agents the caller does not edit and " +
        "agents built on spaces the caller cannot access — requires a workspace " +
        "admin."
    ),
  namePrefix: z
    .string()
    .optional()
    .describe(
      "Only return agents whose name starts with this prefix (case-insensitive)."
    ),
  ...paginationSchemaShape,
};

const getAgentDetailsSchema = {
  agentId: z
    .string()
    .describe("The agent's id (sId), as returned by list_agents."),
};

const listSkillsSchema = {
  availability: z
    .array(z.enum(SKILL_AVAILABILITY_VALUES))
    .optional()
    .describe(
      "Only return skills with one of these availabilities. 'editors': visible " +
        "to the skill's editors only. 'workspace_users': users can enable it " +
        "themselves. 'users_and_agents': also discoverable by agents on their " +
        "own. Omit for all availabilities."
    ),
  status: z
    .enum(SKILL_STATUS_VALUES)
    .optional()
    .describe(
      "Skill status to list. 'active' (default), 'archived', or 'suggested'."
    ),
  kind: z
    .enum(["custom", "global", "system", "all"])
    .default("custom")
    .describe(
      "'custom' (default): skills built in this workspace. 'global' and " +
        "'system': Dust's built-in skills, the latter always on. 'all': every kind."
    ),
  includeUsage: z
    .boolean()
    .optional()
    .describe(
      "Also return how many agents use each skill. Costs an extra query, so " +
        "only set it when the question is about adoption or unused skills."
    ),
  ...paginationSchemaShape,
};

const getSkillSchema = {
  skillId: z
    .string()
    .describe("The skill's id (sId), as returned by list_skills."),
};

export const WORKSPACE_MANAGEMENT_TOOLS_METADATA = [
  {
    name: LIST_AGENTS_TOOL_NAME,
    description:
      "List the workspace's agents. Use this to inventory which agents exist, " +
      "whether they are published, and who can edit them.",
    schema: listAgentsSchema,
    stake: "never_ask",
    displayLabels: {
      running: "Listing agents",
      done: "Listed agents",
    },
    toolCostCategory: "basic",
    freeUsage: true,
  },
  {
    name: GET_AGENT_DETAILS_TOOL_NAME,
    description:
      "Return an agent's full configuration: name, description, scope, model, " +
      "equipped skills and capabilities, and its complete system prompt and " +
      "instructions. Use this to inspect what an agent actually does.",
    schema: getAgentDetailsSchema,
    stake: "never_ask",
    displayLabels: {
      running: "Retrieving agent details",
      done: "Retrieved agent details",
    },
    toolCostCategory: "basic",
    freeUsage: true,
  },
  {
    name: LIST_SKILLS_TOOL_NAME,
    description:
      "List the workspace's skills. Use this to inventory which skills exist " +
      "and who can reach them.",
    schema: listSkillsSchema,
    stake: "never_ask",
    displayLabels: {
      running: "Listing skills",
      done: "Listed skills",
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
    displayLabels: {
      running: "Retrieving skill",
      done: "Retrieved skill",
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
      "Inventory the workspace's agents and skills for admins and managers.",
    icon: "ActionListCheckIcon",
    authorization: null,
    documentationUrl: null,
  },
  tools: WORKSPACE_MANAGEMENT_TOOLS_METADATA,
} as const satisfies ServerMetadata;
